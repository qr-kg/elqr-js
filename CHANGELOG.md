# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-18

Initial public release on npm as `elqr-js`.

### Added

- `buildLink(payload, options?)` — full payment URL with embedded SHA-256 checksum (ID 63).
- `buildFragment(payload)` — bare TLV fragment (everything after `#`).
- `parseLink(input)` — synchronous parser, accepts URL or bare fragment.
- `parseLinkVerified(input)` — async parser that also verifies the checksum.
- `verifyChecksum(input)` — standalone, case-insensitive, defensive checksum verification.
- `createBuilder(defaults)` — factory for pre-configuring `baseUrl` (and other `BuildOptions`) once per app. Validates `baseUrl` eagerly at factory creation.
- Error hierarchy: `ElqrError` → `ElqrEncodeError`, `ElqrParseError`, `ElqrChecksumError`.
- Constants: `SPEC_VERSION`, `DEFAULT_CURRENCY`, `DEFAULT_BASE_URL`, `KGS_TYIYN_PER_UNIT`.
- Validated against real-world links from **MBank**, **DCB (Simbank)**, and **O!Bank**.
- Zero runtime dependencies — uses Web Crypto (`globalThis.crypto.subtle`).
- Strict parser semantics: throws `ElqrParseError` on malformed percent-encoding, duplicate singleton root IDs (00, 01, 32–34, 52–54, 59, 63), non-hex / wrong-length ID 63 checksums, non-digit / negative ID 54 amounts, unknown `visible_state` codes in additional fields. `verifyChecksum` stays lenient (returns `false`).
- Builder rejects astral code points (emoji, non-BMP) in user-facing string fields — the TLV length is counted in UTF-16 code units and would desync.
- `amount = 0` is allowed for `type: "static"` links (real-world compatibility — O!Bank, dengi.kg, etc. emit `54010`) but rejected for `type: "dynamic"`.
- Checksum verification uses the raw fragment substring before ID 63 instead of a reconstructed TLV body — robust against future parser normalization.
- `baseUrl` with non-empty existing fragments is rejected to prevent malformed double-fragment URLs.
- Checksum runtime errors (missing `crypto.subtle`, digest failure) are wrapped in `ElqrError` so the `catch (e) { if (e instanceof ElqrError) … }` contract holds.
- `service.serviceCode` limit is 32 chars (spec v1.3.1 declares 10, but real producers like Finik emit 14-char `"averspay-items"` — wider limit matches de-facto standard, stays within TLV value cap).
