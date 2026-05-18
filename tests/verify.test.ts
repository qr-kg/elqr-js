import { test } from "node:test";
import assert from "node:assert/strict";

import { buildLink } from "../src/build";
import { parseLinkVerified, verifyChecksum } from "../src/parse";
import { ElqrChecksumError } from "../src/errors";

test("verifyChecksum: returns true for a freshly built link", async () => {
  const url = await buildLink({
    type: "dynamic",
    service: { providerId: "kg.example.shop", serviceCode: "checkout" },
    mcc: "5812",
    amount: 5000n,
    providerName: "Alice",
  });
  assert.equal(await verifyChecksum(url), true);
});

test("verifyChecksum: returns false when the fragment is tampered with", async () => {
  const url = await buildLink({
    type: "dynamic",
    service: { providerId: "kg.example.shop", serviceCode: "checkout" },
    mcc: "5812",
    amount: 5000n,
    providerName: "Alice",
  });
  // Swap "5905Alice" for "5903Bob" — same TLV grammar, different payload.
  const tampered = url.replace("5905Alice", "5903Bob");
  assert.notEqual(tampered, url, "test setup: replace should have changed the URL");
  assert.equal(await verifyChecksum(tampered), false);
});

test("verifyChecksum: returns false when ID 63 is missing", async () => {
  // Valid TLV, no checksum field
  const fragment = "00020101021132070003abc52045812530341759019X";
  assert.equal(await verifyChecksum(fragment), false);
});

test("verifyChecksum: returns false on malformed TLV", async () => {
  assert.equal(await verifyChecksum("not-a-tlv"), false);
});

test("verifyChecksum: returns false on malformed percent-encoding (lenient)", async () => {
  // parseLink would throw here; verifyChecksum should return false defensively.
  assert.equal(await verifyChecksum("https://x/#%ZZ"), false);
});

test("verifyChecksum: never throws — wraps SHA-256 runtime failures too", async () => {
  // Simulate a crypto.subtle failure by temporarily replacing digest.
  const originalDigest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  globalThis.crypto.subtle.digest = () => {
    throw new Error("digest unavailable");
  };
  try {
    const fragment =
      "000201010211" +
      "32120003abc01011" +
      "52045812" +
      "5303417" +
      "5901X" +
      "63040000";
    // Must not throw even though SHA-256 failed.
    assert.equal(await verifyChecksum(fragment), false);
  } finally {
    globalThis.crypto.subtle.digest = originalDigest;
  }
});

test("verifyChecksum: comparison is case-insensitive", async () => {
  const url = await buildLink({
    type: "dynamic",
    service: { providerId: "kg.example.shop", serviceCode: "checkout" },
    mcc: "5812",
    providerName: "Alice",
  });
  // Builder emits lowercase. Force uppercase in the checksum and verify still passes.
  const uppercased = url.replace(/6304[0-9a-f]{4}$/, (m) => m.toUpperCase());
  assert.notEqual(uppercased, url);
  assert.equal(await verifyChecksum(uppercased), true);
});

test("parseLinkVerified: throws ElqrChecksumError on mismatch", async () => {
  const url = await buildLink({
    type: "dynamic",
    service: { providerId: "kg.example.shop", serviceCode: "checkout" },
    mcc: "5812",
    providerName: "Alice",
  });
  const tampered = url.replace("5905Alice", "5903Bob");
  await assert.rejects(parseLinkVerified(tampered), ElqrChecksumError);
});

test("parseLinkVerified: succeeds for a valid link", async () => {
  const url = await buildLink({
    type: "dynamic",
    service: { providerId: "kg.example.shop", serviceCode: "checkout" },
    mcc: "5812",
    providerName: "Alice",
  });
  const parsed = await parseLinkVerified(url);
  assert.equal(parsed.providerName, "Alice");
});

test("checksum is deterministic for the same payload", async () => {
  const payload = {
    type: "dynamic" as const,
    service: { providerId: "kg.example.shop", serviceCode: "checkout" },
    mcc: "5812",
    amount: 5000n,
    providerName: "Alice",
  };
  const url1 = await buildLink(payload);
  const url2 = await buildLink(payload);
  assert.equal(url1, url2);
});
