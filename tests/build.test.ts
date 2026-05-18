import { test } from "node:test";
import assert from "node:assert/strict";

import { buildFragment, buildLink, createBuilder } from "../src/build";
import { ElqrEncodeError } from "../src/errors";
import { DEFAULT_BASE_URL } from "../src/constants";
import type { ElqrPayload } from "../src/types";

function baseDynamic(overrides: Partial<ElqrPayload> = {}): ElqrPayload {
  return {
    type: "dynamic",
    service: { providerId: "kg.example.shop", serviceCode: "checkout" },
    mcc: "5812",
    providerName: "Alice",
    ...overrides,
  };
}

test("buildFragment: emits mandatory fields in canonical order", async () => {
  const fragment = await buildFragment(baseDynamic());
  // 00 (version) → 01 (type) → 32 (service) → 52 (mcc) → 53 (currency) → 59 (provider) → 63 (checksum)
  assert.match(fragment, /^00020101021232\d{2}/);
  assert.match(fragment, /5204581253034175905Alice6304[0-9a-f]{4}$/);
});

test("buildLink: prefixes default base URL", async () => {
  const url = await buildLink(baseDynamic());
  assert.ok(url.startsWith(`${DEFAULT_BASE_URL}#`), `unexpected prefix: ${url}`);
});

test("buildLink: respects custom base URL", async () => {
  const url = await buildLink(baseDynamic(), { baseUrl: "https://example.com/" });
  assert.ok(url.startsWith("https://example.com/#"));
});

test("buildLink: handles baseUrl that already ends with '#'", async () => {
  const url = await buildLink(baseDynamic(), { baseUrl: "https://example.com/#" });
  assert.equal(url.indexOf("#"), url.lastIndexOf("#"));
});

test("buildFragment: percent-encode option escapes non-ASCII bytes only", async () => {
  const url = await buildLink(baseDynamic({ comment: "Спасибо" }), { percentEncode: true });
  assert.ok(url.includes("%D0%A1"), "expected Cyrillic byte to be percent-encoded");
  assert.ok(!url.includes("Спасибо"), "raw Cyrillic should not appear when percentEncode=true");
});

test("buildFragment: rejects missing providerId", async () => {
  await assert.rejects(
    buildFragment(baseDynamic({ service: { providerId: "", serviceCode: "checkout" } })),
    ElqrEncodeError,
  );
});

test("buildFragment: rejects payload with neither serviceCode nor merchantId", async () => {
  await assert.rejects(
    buildFragment(baseDynamic({ service: { providerId: "kg.example.shop" } })),
    ElqrEncodeError,
  );
});

test("buildFragment: accepts merchantId in place of serviceCode", async () => {
  const fragment = await buildFragment(
    baseDynamic({
      service: { providerId: "kg.example.shop" },
      merchant: { merchantId: "m-1" },
    }),
  );
  // ID 33 carries SubID 00 (merchantId) with length 3 → "33070003m-1"
  assert.match(fragment, /33070003m-1/);
});

test("buildFragment: rejects mcc that is not 4 digits", async () => {
  await assert.rejects(buildFragment(baseDynamic({ mcc: "581" })), ElqrEncodeError);
  await assert.rejects(buildFragment(baseDynamic({ mcc: "58122" })), ElqrEncodeError);
  await assert.rejects(buildFragment(baseDynamic({ mcc: "abcd" })), ElqrEncodeError);
});

test("buildFragment: rejects currency that is not 3 digits", async () => {
  await assert.rejects(buildFragment(baseDynamic({ currency: "41" })), ElqrEncodeError);
  await assert.rejects(buildFragment(baseDynamic({ currency: "4170" })), ElqrEncodeError);
});

test("buildFragment: rejects providerName > 25 chars", async () => {
  await assert.rejects(
    buildFragment(baseDynamic({ providerName: "a".repeat(26) })),
    ElqrEncodeError,
  );
});

test("buildFragment: rejects comment > 32 chars", async () => {
  await assert.rejects(
    buildFragment(baseDynamic({ comment: "a".repeat(33) })),
    ElqrEncodeError,
  );
});

test("buildFragment: rejects amount=0 / negative for dynamic links", async () => {
  await assert.rejects(buildFragment(baseDynamic({ amount: 0n })), ElqrEncodeError);
  await assert.rejects(buildFragment(baseDynamic({ amount: -1 })), ElqrEncodeError);
  await assert.rejects(buildFragment(baseDynamic({ amount: "0" })), ElqrEncodeError);
});

test("buildFragment: rejects non-integer number amount", async () => {
  await assert.rejects(buildFragment(baseDynamic({ amount: 1.5 })), ElqrEncodeError);
});

test("buildFragment: rejects amount > 13 digits", async () => {
  await assert.rejects(
    buildFragment(baseDynamic({ amount: "1".repeat(14) })),
    ElqrEncodeError,
  );
});

test("buildFragment: normalizes string amount by stripping leading zeros", async () => {
  const fragment = await buildFragment(baseDynamic({ amount: "005000" }));
  // Leading zeros stripped → "5000" (4 digits) → "54045000"
  assert.match(fragment, /54045000/);
});

test("buildFragment: rejects additional field part containing ':'", async () => {
  await assert.rejects(
    buildFragment(
      baseDynamic({
        additionalFields: [
          {
            key: "bad:key",
            label: "x",
            value: "x",
            title: "x",
            visible: "visible",
          },
        ],
      }),
    ),
    ElqrEncodeError,
  );
});

test("buildFragment: distributes additional fields across templates 35..39", async () => {
  const fields = Array.from({ length: 10 }, (_, i) => ({
    key: `k${i}`,
    label: `l${i}`,
    value: "x".repeat(10),
    title: "t",
    visible: "visible" as const,
  }));
  const fragment = await buildFragment(baseDynamic({ additionalFields: fields }));
  // Expect at least one 35 and one 36 template (10 entries don't fit in 99 chars).
  assert.match(fragment, /35\d{2}/);
  assert.match(fragment, /36\d{2}/);
});

test("buildFragment: rejects when additional fields don't fit in 5 templates", async () => {
  const fields = Array.from({ length: 200 }, (_, i) => ({
    key: `k${i}`,
    label: "l",
    value: "x".repeat(20),
    title: "t",
    visible: "visible" as const,
  }));
  await assert.rejects(
    buildFragment(baseDynamic({ additionalFields: fields })),
    ElqrEncodeError,
  );
});

test("buildFragment: static link type encodes as '11'", async () => {
  const fragment = await buildFragment(baseDynamic({ type: "static" }));
  assert.match(fragment, /^000201010211/);
});

test("createBuilder: pre-binds baseUrl for every call", async () => {
  const build = createBuilder({ baseUrl: "https://example.com/" });
  const url = await build(baseDynamic());
  assert.ok(url.startsWith("https://example.com/#"), `unexpected prefix: ${url}`);
});

test("createBuilder: per-call options override pre-bound defaults", async () => {
  const build = createBuilder({ baseUrl: "https://example.com/" });
  const url = await build(baseDynamic(), { baseUrl: "https://other.example/" });
  assert.ok(url.startsWith("https://other.example/#"));
});

test("createBuilder: percentEncode is preserved across calls", async () => {
  const build = createBuilder({ baseUrl: "https://example.com/", percentEncode: true });
  const url = await build(baseDynamic({ comment: "Спасибо" }));
  assert.ok(url.includes("%D0%A1"));
});

test("createBuilder: validates baseUrl eagerly (at factory creation)", () => {
  assert.throws(
    () => createBuilder({ baseUrl: "https://example.com/#oops" }),
    ElqrEncodeError,
  );
});

test("buildLink: rejects baseUrl with non-empty existing fragment", async () => {
  await assert.rejects(
    buildLink(baseDynamic(), { baseUrl: "https://example.com/#foo" }),
    ElqrEncodeError,
  );
});

test("buildLink: trailing '#' in baseUrl is OK (no double fragment)", async () => {
  const url = await buildLink(baseDynamic(), { baseUrl: "https://example.com/#" });
  // Single "#" separator
  assert.equal((url.match(/#/g) ?? []).length, 1);
});

test("buildFragment: rejects astral code points in providerName", async () => {
  await assert.rejects(
    buildFragment(baseDynamic({ providerName: "Tips 🎉" })),
    ElqrEncodeError,
  );
});

test("buildFragment: rejects astral code points in comment", async () => {
  await assert.rejects(
    buildFragment(baseDynamic({ comment: "Спасибо 🙏" })),
    ElqrEncodeError,
  );
});

test("buildFragment: allows amount=0 for static links (real-world compat)", async () => {
  const fragment = await buildFragment(
    baseDynamic({ type: "static", amount: 0n }),
  );
  assert.match(fragment, /54010/);
});

test("buildFragment: rejects amount=0 for dynamic links", async () => {
  await assert.rejects(buildFragment(baseDynamic({ amount: 0n })), ElqrEncodeError);
});

test("buildFragment: rejects negative amount (bigint)", async () => {
  await assert.rejects(buildFragment(baseDynamic({ amount: -1n })), ElqrEncodeError);
});
