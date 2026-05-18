import { ElqrChecksumError, ElqrParseError } from "./errors";
import { computeChecksum } from "./internal/checksum";
import {
  codeToBool,
  codeToLinkType,
  codeToVisibility,
} from "./internal/codes";
import { parseElements, type TlvElement } from "./internal/tlv";
import type {
  ElqrAdditionalField,
  ElqrMerchantInfo,
  ElqrParsed,
  ElqrServiceInfo,
} from "./types";

const ADDITIONAL_IDS = new Set(["35", "36", "37", "38", "39"]);

/**
 * Root IDs that are singletons per the spec — duplicates are a structural error.
 * (35-39 templates may repeat: that's by design to overflow into the next template.)
 */
const SINGLETON_ROOT_IDS = new Set([
  "00",
  "01",
  "32",
  "33",
  "34",
  "52",
  "53",
  "54",
  "59",
  "63",
]);

const CHECKSUM_RE = /^[0-9a-fA-F]{4}$/;
const DIGITS = /^\d+$/;

function findFirst(elements: readonly TlvElement[], id: string): string | undefined {
  return elements.find((e) => e.id === id)?.value;
}

function pickService(template: string): ElqrServiceInfo {
  const subs = parseElements(template);
  const providerId = findFirst(subs, "00");
  if (providerId === undefined) {
    throw new ElqrParseError("ID 32 / SubID 00 (providerId) is required");
  }
  const service: ElqrServiceInfo = { providerId };
  const serviceCode = findFirst(subs, "01");
  if (serviceCode !== undefined) service.serviceCode = serviceCode;
  const recipientId = findFirst(subs, "10");
  if (recipientId !== undefined) service.recipientId = recipientId;
  const transactionId = findFirst(subs, "11");
  if (transactionId !== undefined) service.transactionId = transactionId;
  const amountEditable = findFirst(subs, "12");
  if (amountEditable !== undefined) {
    const flag = codeToBool(amountEditable);
    if (flag !== undefined) service.amountEditable = flag;
  }
  const recipientIdEditable = findFirst(subs, "13");
  if (recipientIdEditable !== undefined) {
    const flag = codeToBool(recipientIdEditable);
    if (flag !== undefined) service.recipientIdEditable = flag;
  }
  return service;
}

function pickMerchant(template: string): ElqrMerchantInfo {
  const subs = parseElements(template);
  const merchant: ElqrMerchantInfo = {};
  const merchantId = findFirst(subs, "00");
  if (merchantId !== undefined) merchant.merchantId = merchantId;
  const serviceName = findFirst(subs, "01");
  if (serviceName !== undefined) merchant.serviceName = serviceName;
  return merchant;
}

function decodeAdditionalField(raw: string): ElqrAdditionalField {
  const parts = raw.split(":");
  if (parts.length !== 5) {
    throw new ElqrParseError(
      `additional field "${raw}" must have 5 ":"-separated parts (key:label:value:title:visible_state)`,
    );
  }
  const [key, label, value, title, visibleState] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  const visible = codeToVisibility(visibleState);
  if (visible === undefined) {
    throw new ElqrParseError(
      `additional field "${raw}" has unknown visible_state "${visibleState}" (expected "11" or "12")`,
    );
  }
  return { key, label, value, title, visible };
}

function collectAdditionalFields(templates: readonly TlvElement[]): ElqrAdditionalField[] {
  const out: ElqrAdditionalField[] = [];
  for (const template of templates) {
    for (const sub of parseElements(template.value)) {
      out.push(decodeAdditionalField(sub.value));
    }
  }
  return out;
}

/**
 * Extract the TLV fragment from a URL or accept a bare fragment.
 *
 * @param input — URL or bare fragment.
 * @param strict — when `true`, malformed percent-encoding throws `ElqrParseError`.
 *                 When `false`, falls back to the raw (still-encoded) string so
 *                 `verifyChecksum` can return `false` instead of throwing.
 */
function extractFragment(input: string, strict: boolean): string {
  const hashIdx = input.indexOf("#");
  const raw = hashIdx === -1 ? input : input.slice(hashIdx + 1);
  try {
    return decodeURIComponent(raw);
  } catch (cause) {
    if (strict) {
      throw new ElqrParseError(
        `malformed percent-encoding in fragment: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    return raw;
  }
}

function parseAmount(raw: string): bigint {
  if (!DIGITS.test(raw)) {
    throw new ElqrParseError(`ID 54 amount "${raw}" must be digits only`);
  }
  return BigInt(raw);
}

function indexElements(elements: readonly TlvElement[]): {
  root: Map<string, TlvElement>;
  additional: TlvElement[];
} {
  const root = new Map<string, TlvElement>();
  const additional: TlvElement[] = [];
  for (const el of elements) {
    if (ADDITIONAL_IDS.has(el.id)) {
      additional.push(el);
      continue;
    }
    if (SINGLETON_ROOT_IDS.has(el.id) && root.has(el.id)) {
      throw new ElqrParseError(`duplicate root ID "${el.id}"`);
    }
    root.set(el.id, el);
  }
  return { root, additional };
}

function doParse(input: string, strict: boolean): {
  parsed: ElqrParsed;
  fragment: string;
  elements: TlvElement[];
} {
  const fragment = extractFragment(input, strict);
  const elements = parseElements(fragment);

  const { root, additional } = indexElements(elements);

  const required = (id: string, label: string): string => {
    const el = root.get(id);
    if (!el) throw new ElqrParseError(`missing required ID "${id}" (${label})`);
    return el.value;
  };

  const typeCode = required("01", "link type");
  const type = codeToLinkType(typeCode);
  if (type === undefined) {
    throw new ElqrParseError(`unknown link type "${typeCode}" (expected "11" or "12")`);
  }

  const checksum = required("63", "checksum");
  if (!CHECKSUM_RE.test(checksum)) {
    throw new ElqrParseError(
      `ID 63 checksum "${checksum}" must be 4 hexadecimal characters`,
    );
  }

  const parsed: ElqrParsed = {
    version: required("00", "version"),
    type,
    service: pickService(required("32", "service info")),
    mcc: required("52", "MCC"),
    currency: required("53", "currency"),
    providerName: required("59", "provider name"),
    checksum,
  };

  const merchant = root.get("33");
  if (merchant) parsed.merchant = pickMerchant(merchant.value);
  const comment = root.get("34");
  if (comment) parsed.comment = comment.value;
  if (additional.length) parsed.additionalFields = collectAdditionalFields(additional);
  const amount = root.get("54");
  if (amount) parsed.amount = parseAmount(amount.value);

  return { parsed, fragment, elements };
}

/**
 * Locate the byte range of the ID 63 field within a TLV fragment and return both
 * the raw body slice (everything before it) and the embedded checksum value.
 *
 * Using a substring of the original input — rather than re-encoding parsed elements —
 * guarantees the recomputed checksum reflects exactly what the producer hashed, even
 * if the parser were ever to normalize values in the future.
 */
function locateChecksum(fragment: string): { body: string; checksum: string } {
  let i = 0;
  while (i < fragment.length) {
    if (i + 4 > fragment.length) {
      throw new ElqrParseError(`truncated TLV header at offset ${i}`);
    }
    const id = fragment.slice(i, i + 2);
    const lenStr = fragment.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenStr)) {
      throw new ElqrParseError(`invalid TLV header "${id}${lenStr}" at offset ${i}`);
    }
    const len = Number(lenStr);
    const valueEnd = i + 4 + len;
    if (valueEnd > fragment.length) {
      throw new ElqrParseError(`TLV value for id ${id} overflows the fragment`);
    }
    if (id === "63") {
      return {
        body: fragment.slice(0, i),
        checksum: fragment.slice(i + 4, valueEnd),
      };
    }
    i = valueEnd;
  }
  throw new ElqrParseError("missing required ID 63 (checksum)");
}

/**
 * Parse an ELQR payment link or bare fragment.
 *
 * Does **not** verify the checksum — use {@link parseLinkVerified} for that.
 *
 * @param input — full URL (`https://…/#…`) or a bare fragment.
 * @returns the parsed payload (see {@link ElqrParsed}).
 * @throws {ElqrParseError} on malformed TLV, malformed percent-encoding,
 *         missing required IDs, duplicate singleton IDs, or unknown coded values.
 *
 * @example
 * const parsed = parseLink("https://pay.payqr.kg/#0002010102...");
 * console.log(parsed.providerName, parsed.amount);
 */
export function parseLink(input: string): ElqrParsed {
  return doParse(input, /* strict */ true).parsed;
}

/**
 * Parse and verify the SHA-256 checksum (ID 63) of an ELQR link.
 *
 * Comparison is case-insensitive — real-world producers emit either case.
 *
 * @throws {ElqrParseError} on malformed input.
 * @throws {ElqrChecksumError} when the embedded checksum doesn't match the recomputed one.
 */
export async function parseLinkVerified(input: string): Promise<ElqrParsed> {
  const { parsed, fragment } = doParse(input, /* strict */ true);
  const { body, checksum } = locateChecksum(fragment);
  const expected = await computeChecksum(body);
  if (expected.toLowerCase() !== checksum.toLowerCase()) {
    throw new ElqrChecksumError(
      `checksum mismatch: expected "${expected}", got "${checksum}"`,
    );
  }
  return parsed;
}

/**
 * Recompute the checksum over the input and compare to the embedded ID 63 value.
 *
 * Returns `false` when the input has no ID 63 field, when TLV is malformed,
 * or when the checksums don't match. Comparison is case-insensitive — never throws.
 *
 * @example
 * if (await verifyChecksum(url)) {
 *   // safe to trust the TLV payload
 * }
 */
export async function verifyChecksum(input: string): Promise<boolean> {
  try {
    const fragment = extractFragment(input, /* strict */ false);
    const { body, checksum } = locateChecksum(fragment);
    const expected = await computeChecksum(body);
    return expected.toLowerCase() === checksum.toLowerCase();
  } catch {
    return false;
  }
}
