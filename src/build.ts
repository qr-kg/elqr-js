import {
  DEFAULT_BASE_URL,
  DEFAULT_CURRENCY,
  SPEC_VERSION,
} from "./constants";
import { ElqrEncodeError } from "./errors";
import { boolToCode, LINK_TYPE_CODE, VISIBILITY_CODE } from "./internal/codes";
import { computeChecksum } from "./internal/checksum";
import { encodeElement, encodeElements, type TlvElement } from "./internal/tlv";
import {
  assertMaxLen,
  assertNoAstralChars,
  assertNoColon,
  DIGITS,
  FOUR_DIGITS,
  THREE_DIGITS,
} from "./internal/validation";
import type {
  BuildOptions,
  ElqrAdditionalField,
  ElqrMerchantInfo,
  ElqrPayload,
  ElqrServiceInfo,
} from "./types";

const ADDITIONAL_TEMPLATE_IDS = ["35", "36", "37", "38", "39"] as const;
const TLV_VALUE_MAX = 99;
const MAX_AMOUNT_DIGITS = 13;

function assertField(value: string, max: number, label: string): void {
  assertMaxLen(value, max, label);
  assertNoAstralChars(value, label);
}

function buildServiceTlv(
  service: ElqrServiceInfo,
  merchant: ElqrMerchantInfo | undefined,
): string {
  if (!service.providerId) {
    throw new ElqrEncodeError("service.providerId is required (ID 32 / SubID 00)");
  }
  assertField(service.providerId, 32, "service.providerId");

  if (service.serviceCode === undefined && merchant?.merchantId === undefined) {
    throw new ElqrEncodeError(
      "either service.serviceCode (ID 32 / SubID 01) or merchant.merchantId (ID 33 / SubID 00) must be set",
    );
  }

  const elements: TlvElement[] = [{ id: "00", value: service.providerId }];

  if (service.serviceCode !== undefined) {
    // Spec v1.3.1 declares max 10 chars, but real producers (Finik, etc.) routinely
    // ship 14-char serviceCodes. Relaxed to 32 to match the de-facto standard while
    // staying within the TLV value limit. See real-vectors.test.ts for evidence.
    assertField(service.serviceCode, 32, "service.serviceCode");
    elements.push({ id: "01", value: service.serviceCode });
  }
  if (service.recipientId !== undefined) {
    assertField(service.recipientId, 32, "service.recipientId");
    elements.push({ id: "10", value: service.recipientId });
  }
  if (service.transactionId !== undefined) {
    assertField(service.transactionId, 32, "service.transactionId");
    elements.push({ id: "11", value: service.transactionId });
  }
  if (service.amountEditable !== undefined) {
    elements.push({ id: "12", value: boolToCode(service.amountEditable) });
  }
  if (service.recipientIdEditable !== undefined) {
    elements.push({ id: "13", value: boolToCode(service.recipientIdEditable) });
  }

  return encodeElements(elements);
}

function buildMerchantTlv(merchant: ElqrMerchantInfo): string | undefined {
  const elements: TlvElement[] = [];
  if (merchant.merchantId !== undefined) {
    assertField(merchant.merchantId, 32, "merchant.merchantId");
    elements.push({ id: "00", value: merchant.merchantId });
  }
  if (merchant.serviceName !== undefined) {
    assertField(merchant.serviceName, 32, "merchant.serviceName");
    elements.push({ id: "01", value: merchant.serviceName });
  }
  return elements.length ? encodeElements(elements) : undefined;
}

function encodeAdditionalField(field: ElqrAdditionalField): string {
  const visibility = VISIBILITY_CODE[field.visible];
  const parts = [field.key, field.label, field.value, field.title];
  for (const part of parts) {
    assertNoColon(part, "additional field part");
    assertNoAstralChars(part, "additional field part");
  }
  return `${parts.join(":")}:${visibility}`;
}

function buildAdditionalTlv(fields: readonly ElqrAdditionalField[]): TlvElement[] {
  const out: TlvElement[] = [];
  let templateIdx = 0;
  let buffer = "";
  let subId = 0;

  const flush = (): void => {
    if (!buffer) return;
    if (templateIdx >= ADDITIONAL_TEMPLATE_IDS.length) {
      throw new ElqrEncodeError(
        "additional fields exceed the capacity of ID 35-39 templates",
      );
    }
    out.push({ id: ADDITIONAL_TEMPLATE_IDS[templateIdx]!, value: buffer });
    templateIdx += 1;
    buffer = "";
    subId = 0;
  };

  for (const field of fields) {
    const entry = encodeElement(subId, encodeAdditionalField(field));
    if (entry.length > TLV_VALUE_MAX) {
      throw new ElqrEncodeError(
        `additional field "${field.key}" encodes to ${entry.length} chars; single-element max is ${TLV_VALUE_MAX}`,
      );
    }
    if (buffer.length + entry.length > TLV_VALUE_MAX) flush();
    buffer += entry;
    subId += 1;
  }
  flush();
  return out;
}

/**
 * Convert user-supplied amount to its on-wire digit-string representation.
 *
 * The spec requires a positive integer in tyiyn. The builder allows `0` only for
 * `static` links — some real banks (O!Bank, dengi.kg) emit `54010` (amount=0) on
 * static QR codes as a "no fixed amount" sentinel, and rejecting it would make
 * parsed real-world payloads non-rebuildable. Dynamic links must still be > 0.
 */
function normalizeAmount(
  amount: NonNullable<ElqrPayload["amount"]>,
  linkType: ElqrPayload["type"],
): string {
  let str: string;
  if (typeof amount === "bigint") {
    if (amount < 0n) throw new ElqrEncodeError("amount must be ≥ 0");
    str = amount.toString();
  } else if (typeof amount === "number") {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new ElqrEncodeError("amount must be a non-negative integer (tyiyn)");
    }
    str = String(amount);
  } else {
    if (!DIGITS.test(amount)) {
      throw new ElqrEncodeError(`amount "${amount}" is not a digit string`);
    }
    const stripped = amount.replace(/^0+/, "");
    str = stripped || "0";
  }
  if (str === "0" && linkType === "dynamic") {
    throw new ElqrEncodeError(
      "amount must be > 0 for dynamic links (0 is only allowed on static links per real-world convention)",
    );
  }
  if (str.length > MAX_AMOUNT_DIGITS) {
    throw new ElqrEncodeError(`amount ${str} exceeds ${MAX_AMOUNT_DIGITS} digits`);
  }
  return str;
}

function percentEncodeFragment(fragment: string): string {
  let out = "";
  for (const ch of fragment) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      out += ch;
      continue;
    }
    const bytes = new TextEncoder().encode(ch);
    for (const b of bytes) {
      out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

/**
 * Build just the TLV fragment (everything after `#` in a payment URL),
 * including the SHA-256 checksum at ID 63.
 *
 * @example
 * const fragment = await buildFragment({
 *   type: "dynamic",
 *   service: { providerId: "kg.example.shop", serviceCode: "checkout" },
 *   mcc: "5812",
 *   amount: 5000n, // tyiyn
 *   providerName: "Alice",
 * });
 *
 * @throws {ElqrEncodeError} when any required field is missing or a value exceeds spec limits.
 */
export async function buildFragment(payload: ElqrPayload): Promise<string> {
  const version = payload.version ?? SPEC_VERSION;
  if (!DIGITS.test(version)) {
    throw new ElqrEncodeError(`version "${version}" must be numeric`);
  }
  const typeCode = LINK_TYPE_CODE[payload.type];
  if (typeCode === undefined) {
    throw new ElqrEncodeError(`type must be "static" or "dynamic"`);
  }
  if (!FOUR_DIGITS.test(payload.mcc)) {
    throw new ElqrEncodeError(`mcc "${payload.mcc}" must be exactly 4 digits`);
  }
  const currency = payload.currency ?? DEFAULT_CURRENCY;
  if (!THREE_DIGITS.test(currency)) {
    throw new ElqrEncodeError(`currency "${currency}" must be a 3-digit ISO 4217 code`);
  }
  assertField(payload.providerName, 25, "providerName");

  const elements: TlvElement[] = [
    { id: "00", value: version },
    { id: "01", value: typeCode },
    { id: "32", value: buildServiceTlv(payload.service, payload.merchant) },
  ];

  if (payload.merchant) {
    const merchantTlv = buildMerchantTlv(payload.merchant);
    if (merchantTlv !== undefined) elements.push({ id: "33", value: merchantTlv });
  }
  if (payload.comment !== undefined) {
    assertField(payload.comment, 32, "comment");
    elements.push({ id: "34", value: payload.comment });
  }
  if (payload.additionalFields?.length) {
    elements.push(...buildAdditionalTlv(payload.additionalFields));
  }

  elements.push({ id: "52", value: payload.mcc });
  elements.push({ id: "53", value: currency });
  if (payload.amount !== undefined) {
    elements.push({
      id: "54",
      value: normalizeAmount(payload.amount, payload.type),
    });
  }
  elements.push({ id: "59", value: payload.providerName });

  const body = encodeElements(elements);
  const checksum = await computeChecksum(body);
  return body + encodeElement("63", checksum);
}

/**
 * Build a full payment URL: `${baseUrl}#${fragment}`.
 *
 * @param payload — link payload (see {@link ElqrPayload}).
 * @param options — optional base URL and percent-encoding flag.
 * @returns the full URL ready to be embedded in a QR code.
 *
 * @example
 * // Default base URL (https://pay.payqr.kg/):
 * const url = await buildLink({
 *   type: "static",
 *   service: { providerId: "kg.example.shop", serviceCode: "checkout", recipientId: "alice" },
 *   mcc: "5812",
 *   providerName: "Alice",
 * });
 *
 * @example
 * // Custom base URL (e.g. your own deep-link domain):
 * const url = await buildLink(payload, { baseUrl: "https://example.com/" });
 *
 * @throws {ElqrEncodeError} for invalid input.
 */
function resolveBaseUrl(baseUrl: string | undefined): string {
  const url = baseUrl ?? DEFAULT_BASE_URL;
  // Allow URLs ending with "#" as a marker, but reject anything with fragment content
  // since that would produce a malformed double-fragment URL.
  const hashIdx = url.indexOf("#");
  if (hashIdx !== -1 && hashIdx !== url.length - 1) {
    throw new ElqrEncodeError(
      `baseUrl "${url}" already contains a non-empty fragment; pass a base URL without "#…" content`,
    );
  }
  return url;
}

export async function buildLink(
  payload: ElqrPayload,
  options: BuildOptions = {},
): Promise<string> {
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const fragment = await buildFragment(payload);
  const encoded = options.percentEncode ? percentEncodeFragment(fragment) : fragment;
  const separator = baseUrl.endsWith("#") ? "" : "#";
  return `${baseUrl}${separator}${encoded}`;
}

/**
 * Create a `buildLink` pre-configured with default {@link BuildOptions} (e.g. `baseUrl`).
 *
 * Useful when an application always emits links for the same deep-link domain —
 * configure once at startup instead of passing `options.baseUrl` to every call.
 * Per-call options still override the configured defaults.
 *
 * Use the top-level {@link buildFragment} directly — fragments don't depend on `baseUrl`,
 * so there's nothing to pre-configure.
 *
 * @example
 * const buildLink = createBuilder({ baseUrl: "https://example.com/" });
 * const url = await buildLink(payload);
 */
export function createBuilder(
  defaults: BuildOptions = {},
): (payload: ElqrPayload, options?: BuildOptions) => Promise<string> {
  // Validate baseUrl eagerly so misconfiguration is caught at app startup, not at first call.
  if (defaults.baseUrl !== undefined) resolveBaseUrl(defaults.baseUrl);
  return (payload, options) => buildLink(payload, { ...defaults, ...options });
}
