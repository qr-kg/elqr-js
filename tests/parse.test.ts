import { test } from "node:test";
import assert from "node:assert/strict";

import { buildLink } from "../src/build";
import { parseLink } from "../src/parse";
import { ElqrParseError } from "../src/errors";

test("parseLink: roundtrips a dynamic link with all optional fields", async () => {
  const url = await buildLink({
    type: "dynamic",
    service: {
      providerId: "kg.example.shop",
      serviceCode: "checkout",
      recipientId: "alice",
      transactionId: "tx-1",
      amountEditable: false,
      recipientIdEditable: true,
    },
    merchant: { merchantId: "m-1", serviceName: "Tips" },
    comment: "Привет",
    additionalFields: [
      { key: "k1", label: "l", value: "v", title: "t", visible: "visible" },
    ],
    mcc: "5812",
    amount: 5000n,
    providerName: "Alice",
  });

  const parsed = parseLink(url);
  assert.equal(parsed.version, "01");
  assert.equal(parsed.type, "dynamic");
  assert.equal(parsed.service.providerId, "kg.example.shop");
  assert.equal(parsed.service.serviceCode, "checkout");
  assert.equal(parsed.service.recipientId, "alice");
  assert.equal(parsed.service.transactionId, "tx-1");
  assert.equal(parsed.service.amountEditable, false);
  assert.equal(parsed.service.recipientIdEditable, true);
  assert.equal(parsed.merchant?.merchantId, "m-1");
  assert.equal(parsed.merchant?.serviceName, "Tips");
  assert.equal(parsed.comment, "Привет");
  assert.equal(parsed.additionalFields?.length, 1);
  assert.deepEqual(parsed.additionalFields?.[0], {
    key: "k1",
    label: "l",
    value: "v",
    title: "t",
    visible: "visible",
  });
  assert.equal(parsed.mcc, "5812");
  assert.equal(parsed.currency, "417");
  assert.equal(parsed.amount, 5000n);
  assert.equal(parsed.providerName, "Alice");
  assert.match(parsed.checksum, /^[0-9a-fA-F]{4}$/);
});

test("parseLink: accepts bare fragment without URL prefix", async () => {
  const url = await buildLink({
    type: "static",
    service: { providerId: "kg.example.shop", serviceCode: "checkout" },
    mcc: "5812",
    providerName: "Alice",
  });
  const fragment = url.split("#", 2)[1]!;
  const parsed = parseLink(fragment);
  assert.equal(parsed.providerName, "Alice");
});

test("parseLink: decodes percent-encoded Cyrillic", async () => {
  const url = await buildLink(
    {
      type: "dynamic",
      service: { providerId: "kg.example.shop", serviceCode: "checkout" },
      mcc: "5812",
      providerName: "Бариста",
      comment: "Спасибо",
    },
    { percentEncode: true },
  );
  assert.ok(url.includes("%D0"));
  const parsed = parseLink(url);
  assert.equal(parsed.providerName, "Бариста");
  assert.equal(parsed.comment, "Спасибо");
});

test("parseLink: amount comes back as bigint", async () => {
  const url = await buildLink({
    type: "dynamic",
    service: { providerId: "p", serviceCode: "s" },
    mcc: "5812",
    amount: "100",
    providerName: "X",
  });
  const parsed = parseLink(url);
  assert.equal(typeof parsed.amount, "bigint");
  assert.equal(parsed.amount, 100n);
});

test("parseLink: missing required field throws ElqrParseError", () => {
  // valid TLV but no ID 32 / 52 / 53 / 59 / 63 → "missing required ID"
  assert.throws(() => parseLink("00020101021"), ElqrParseError);
});

test("parseLink: malformed TLV throws ElqrParseError", () => {
  assert.throws(() => parseLink("000"), ElqrParseError);
});

test("parseLink: unknown link type throws ElqrParseError", async () => {
  // build a valid link, then corrupt the type code from "12" (dynamic) to "99"
  const url = await buildLink({
    type: "dynamic",
    service: { providerId: "p", serviceCode: "s" },
    mcc: "5812",
    providerName: "X",
  });
  const corrupted = url.replace("010212", "010299");
  assert.throws(() => parseLink(corrupted), ElqrParseError);
});

test("parseLink: amount of 0 is parsed as 0n (real producers emit it)", () => {
  // Hand-crafted minimal static fragment with amount "0".
  // Checksum value is arbitrary because parseLink doesn't verify.
  const fragment =
    "000201" + // 00 — version 01
    "010211" + // 01 — static
    "32120003abc01011" + // 32 — providerId "abc", serviceCode "1"
    "52045812" + // 52 — MCC
    "5303417" + // 53 — currency
    "54010" + // 54 — amount "0"
    "5901X" + // 59 — providerName "X"
    "63040000"; // 63 — dummy checksum
  const parsed = parseLink(fragment);
  assert.equal(parsed.amount, 0n);
});

test("parseLink: rejects negative amount string", () => {
  // ID 54 length 02 value "-1" — physically encodable, semantically invalid.
  const fragment =
    "000201010211" +
    "32120003abc01011" +
    "52045812" +
    "5303417" +
    "5402-1" +
    "5901X" +
    "63040000";
  assert.throws(() => parseLink(fragment), ElqrParseError);
});

test("parseLink: rejects unknown visible_state in additional field", async () => {
  // Build a valid fragment, then corrupt the visibility code from 11 → 99 inside
  // the additional field. Using parseLink (no checksum verification needed).
  const { buildLink } = await import("../src/build");
  const url = await buildLink({
    type: "static",
    service: { providerId: "p", serviceCode: "s" },
    mcc: "5812",
    providerName: "X",
    additionalFields: [
      { key: "k", label: "l", value: "v", title: "t", visible: "visible" },
    ],
  });
  // Replace "k:l:v:t:11" with "k:l:v:t:99"
  const corrupted = url.replace("k:l:v:t:11", "k:l:v:t:99");
  assert.notEqual(corrupted, url);
  assert.throws(() => parseLink(corrupted), ElqrParseError);
});

test("parseLink: rejects duplicate singleton root ID", () => {
  // Two ID 00 fields — structurally ambiguous, must be rejected.
  const fragment =
    "000201" +
    "000201" + // duplicate version
    "010211" +
    "32120003abc01011" +
    "52045812" +
    "5303417" +
    "5901X" +
    "63040000";
  assert.throws(() => parseLink(fragment), ElqrParseError);
});

test("parseLink: rejects malformed ID 63 (not 4 hex chars)", () => {
  const fragment =
    "000201010211" +
    "32120003abc01011" +
    "52045812" +
    "5303417" +
    "5901X" +
    "6304XYZW"; // non-hex
  assert.throws(() => parseLink(fragment), ElqrParseError);
});

test("parseLink: rejects malformed percent-encoding in URL", () => {
  // "%ZZ" is not a valid percent-encoded byte.
  assert.throws(() => parseLink("https://x/#0002 01%ZZ"), ElqrParseError);
});
