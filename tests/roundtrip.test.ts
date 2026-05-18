import { test } from "node:test";
import assert from "node:assert/strict";

import { buildLink } from "../src/build";
import { parseLink } from "../src/parse";
import type { ElqrPayload } from "../src/types";

const matrix: ReadonlyArray<readonly [string, ElqrPayload]> = [
  [
    "minimal static",
    {
      type: "static",
      service: { providerId: "kg.example.shop", serviceCode: "checkout" },
      mcc: "5812",
      providerName: "Alice",
    },
  ],
  [
    "minimal dynamic with amount",
    {
      type: "dynamic",
      service: { providerId: "kg.example.shop", serviceCode: "checkout" },
      mcc: "5812",
      amount: 5000n,
      providerName: "Alice",
    },
  ],
  [
    "with merchant + serviceName",
    {
      type: "dynamic",
      service: { providerId: "kg.example.shop", serviceCode: "checkout" },
      merchant: { merchantId: "m-1", serviceName: "Tips" },
      mcc: "5812",
      providerName: "Alice",
    },
  ],
  [
    "merchantId instead of serviceCode",
    {
      type: "static",
      service: { providerId: "kg.example.shop" },
      merchant: { merchantId: "m-42" },
      mcc: "5812",
      providerName: "Alice",
    },
  ],
  [
    "with comment + Cyrillic provider name",
    {
      type: "dynamic",
      service: { providerId: "kg.example.shop", serviceCode: "checkout" },
      mcc: "5812",
      amount: 12345n,
      providerName: "Бариста",
      comment: "Спасибо!",
    },
  ],
  [
    "with edit flags",
    {
      type: "dynamic",
      service: {
        providerId: "kg.example.shop",
        serviceCode: "checkout",
        amountEditable: false,
        recipientIdEditable: false,
      },
      mcc: "5812",
      providerName: "Alice",
    },
  ],
  [
    "with additional fields",
    {
      type: "static",
      service: { providerId: "kg.example.shop", serviceCode: "checkout" },
      mcc: "5812",
      providerName: "Alice",
      additionalFields: [
        { key: "rating", label: "Оценка", value: "5", title: "5★", visible: "visible" },
        { key: "table", label: "Стол", value: "12", title: "12", visible: "hidden" },
      ],
    },
  ],
  [
    "all features combined",
    {
      type: "dynamic",
      service: {
        providerId: "kg.example.shop",
        serviceCode: "checkout",
        recipientId: "alice",
        transactionId: "tx-42",
        amountEditable: true,
        recipientIdEditable: false,
      },
      merchant: { merchantId: "m-1", serviceName: "Tips" },
      mcc: "5812",
      currency: "417",
      amount: 5000n,
      providerName: "Alice",
      comment: "С Новым годом!",
      additionalFields: [
        { key: "k1", label: "L1", value: "v1", title: "t1", visible: "visible" },
      ],
    },
  ],
];

for (const [name, payload] of matrix) {
  test(`roundtrip: ${name}`, async () => {
    const url = await buildLink(payload);
    const parsed = parseLink(url);

    assert.equal(parsed.type, payload.type);
    assert.equal(parsed.service.providerId, payload.service.providerId);
    assert.equal(parsed.service.serviceCode, payload.service.serviceCode);
    assert.equal(parsed.service.recipientId, payload.service.recipientId);
    assert.equal(parsed.service.transactionId, payload.service.transactionId);
    assert.equal(parsed.service.amountEditable, payload.service.amountEditable);
    assert.equal(parsed.service.recipientIdEditable, payload.service.recipientIdEditable);
    assert.equal(parsed.merchant?.merchantId, payload.merchant?.merchantId);
    assert.equal(parsed.merchant?.serviceName, payload.merchant?.serviceName);
    assert.equal(parsed.comment, payload.comment);
    assert.equal(parsed.mcc, payload.mcc);
    assert.equal(parsed.currency, payload.currency ?? "417");
    assert.equal(parsed.providerName, payload.providerName);

    if (payload.amount !== undefined) {
      assert.equal(parsed.amount, BigInt(payload.amount));
    } else {
      assert.equal(parsed.amount, undefined);
    }

    if (payload.additionalFields) {
      assert.deepEqual(parsed.additionalFields, payload.additionalFields);
    }

    // Idempotency: rebuilding from parsed yields the same URL.
    const rebuilt = await buildLink({
      type: parsed.type,
      service: parsed.service,
      merchant: parsed.merchant,
      comment: parsed.comment,
      additionalFields: parsed.additionalFields,
      mcc: parsed.mcc,
      currency: parsed.currency,
      amount: parsed.amount,
      providerName: parsed.providerName,
    });
    assert.equal(rebuilt, url);
  });
}
