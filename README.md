# elqr

> TypeScript library for building and parsing payment links per
> the ELQR specification — Kyrgyzstan's national
> instant-payment
> QR system.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen)

🇷🇺 **[README на русском](./README.ru.md)**

## Features

- ✅ Build and parse payment links per ELQR spec v1.3.1
- ✅ SHA-256 checksum generation and case-insensitive verification
- ✅ Validated against real production links from **MBank**, **DCB**, and **O!Bank**
- ✅ Zero runtime dependencies — uses Web Crypto (Node ≥ 20, modern browsers)
- ✅ Strict TypeScript, full JSDoc, narrow public API surface
- ✅ Symmetric input/output types — `amount` is `bigint` in and out

## About ELQR

ELQR is Kyrgyzstan's national instant-payment QR standard, supported by every Kyrgyz bank since 2022. A payment link is
a URL whose **fragment** (everything after `#`) is a TLV-encoded payload describing the payee, amount, currency, and an
integrity checksum. Any Kyrgyz banking app can scan or open such a link and execute the payment.

Live deep-link router: <https://pay.payqr.kg>

## Bank deep-link routers

The default `baseUrl` (`https://pay.payqr.kg/`) opens any Kyrgyz bank app via the universal router. To open a specific
bank's app directly, pass one of the bank-published prefixes below as `baseUrl`.

| Bank      | Deep-link prefix                 |
|-----------|----------------------------------|
| Finik     | `https://qr.finik.kg/`           |
| MBank     | `https://app.mbank.kg/qr/`       |
| O!Деньги  | `https://api.dengi.o.kg/`        |
| Bakai     | `https://bakai.app/`             |
| Elcart    | `https://pay.payqr.kg/`          |
| DantePay  | `https://pay.payqr.kg/`          |
| Simbank   | `https://pay.payqr.kg/`          |
| MegaPay   | `https://megapay.kg/get` *       |
| Optima24  | `https://pay.payqr.kg/` *        |
| РСК24     | `https://qr.rsk.kg/` *           |
| NambaOne  | `https://nambaone.app/` *        |
| KICB      | `https://bank.kicb.net/` *       |
| АБ24      | `https://qr.ab.kg/` *            |
| DemirBank | `https://retail.demirbank.kg/` * |
| Balance   | `https://balance.kg/` *          |
| Компаньон | `https://24.kompanion.kg/qr/` *  |
| Элдик     | `https://app.eldik.kg/` *        |

\* Not verified against a real production link — if in doubt, use the default `https://pay.payqr.kg/`.

Some prefixes wrap the fragment behind an empty query parameter (`?…=#…`) — the TLV still lives after `#`, so parsing
works uniformly.

## Install

```bash
npm install @qr.kg/elqr-js
```

Also published as **`@qr-kg/elqr-js`** (matching the GitHub org name) — identical code, identical version. Pick whichever scope you prefer; both are kept in sync on every release.

## Quick start

```ts
import { buildLink, parseLink, parseLinkVerified } from "@qr.kg/elqr-js";

// Build a payment URL — the amount is in tyiyn (1 KGS = 100 tyiyn).
const url = await buildLink({
  type: "dynamic",
  service: {
    providerId: "kg.example.shop",
    serviceCode: "checkout",
    recipientId: "alice",
  },
  mcc: "5812", // ISO 18245 — eating places
  amount: 5000n, // 50.00 KGS
  providerName: "Alice",
  comment: "Спасибо!",
});
// → "https://pay.payqr.kg/#0002010102123232..."

// Parse a payment URL (no checksum verification).
const parsed = parseLink(url);
console.log(parsed.providerName, parsed.amount); // "Alice" 5000n

// Parse and verify the checksum in one call.
const verified = await parseLinkVerified(url); // throws ElqrChecksumError on mismatch
```

### Custom deep-link domain

The default `baseUrl` is `https://pay.payqr.kg/` (the universal ELQR router). To emit links pointing at your own
domain (e.g. for a registered deep-link handler), pass `baseUrl` per call or pre-configure a builder:

```ts
// Per-call override:
const url = await buildLink(payload, { baseUrl: "https://example.com/" });

// Or pre-configure once at app startup:
import { createBuilder } from "@qr.kg/elqr-js";

const buildLink = createBuilder({ baseUrl: "https://example.com/" });
const url1 = await buildLink(payload);
const url2 = await buildLink(otherPayload);
```

## API

### `buildLink(payload, options?) → Promise<string>`

Builds the full payment URL (`${baseUrl}#${fragment}`) with the SHA-256 checksum at ID 63.

```ts
function buildLink(payload: ElqrPayload, options?: BuildOptions): Promise<string>;

interface BuildOptions {
  baseUrl?: string;        // defaults to "https://pay.payqr.kg/"
  percentEncode?: boolean; // percent-encode non-ASCII bytes for URL transport
}
```

Throws `ElqrEncodeError` if any field is missing or exceeds spec limits.

### `buildFragment(payload) → Promise<string>`

Same as `buildLink` but returns only the TLV fragment (no scheme/host/`#`). Useful when embedding directly into a QR
code without a URL wrapper.

### `createBuilder(defaults?) → buildLink`

Returns a pre-configured `buildLink` function. Per-call `options` still override the defaults. `baseUrl` is validated
eagerly at factory creation so misconfiguration fails at app startup, not at first call.

```ts
const buildLink = createBuilder({baseUrl: "https://example.com/", percentEncode: true});
const url = await buildLink(payload);
```

`buildFragment` doesn't depend on `baseUrl`, so import it directly from the package when needed.

### `parseLink(input) → ElqrParsed`

Synchronously parses a URL or bare fragment. **Does not verify the checksum.** Throws `ElqrParseError` on malformed TLV
or missing required IDs.

### `parseLinkVerified(input) → Promise<ElqrParsed>`

Parses **and** verifies the SHA-256 checksum (case-insensitive). Throws `ElqrParseError` on malformed input or
`ElqrChecksumError` on a checksum mismatch.

### `verifyChecksum(input) → Promise<boolean>`

Standalone, defensive checksum check. Returns `false` for missing/mismatched checksums or malformed TLV — never throws.

### Constants

```ts
import {
  SPEC_VERSION,         // "01"
  DEFAULT_CURRENCY,     // "417" (KGS)
  DEFAULT_BASE_URL,     // "https://pay.payqr.kg/"
  KGS_TYIYN_PER_UNIT,   // 100n
} from "@qr.kg/elqr-js";
```

### Errors

```
ElqrError                  ← catch-all base class
├── ElqrEncodeError        ← thrown by builders for invalid input
├── ElqrParseError         ← thrown by parsers for malformed TLV / missing IDs
└── ElqrChecksumError      ← thrown by parseLinkVerified on checksum mismatch
```

## Spec compliance

Supported root IDs:

| ID    | Name                         | Status     |
|-------|------------------------------|------------|
| 00    | Version                      | required ✅ |
| 01    | Link type (static / dynamic) | required ✅ |
| 32    | Service / provider info      | required ✅ |
| 33    | Merchant info                | optional ✅ |
| 34    | Comment                      | optional ✅ |
| 35-39 | Additional fields            | optional ✅ |
| 52    | MCC (ISO 18245)              | required ✅ |
| 53    | Currency (ISO 4217)          | required ✅ |
| 54    | Amount in tyiyn              | optional ✅ |
| 59    | Provider name                | required ✅ |
| 63    | SHA-256 checksum             | required ✅ |

Producer-side validation enforces spec length limits. Parser-side is lenient with edge cases observed in real links (
uppercase checksums, `amount=0` in static links, non-canonical field ordering).

## License

[MIT](./LICENSE)
