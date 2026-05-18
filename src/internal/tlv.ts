import { ElqrEncodeError, ElqrParseError } from "../errors";

/**
 * Internal TLV (tag-length-value) codec for the ELQR fragment format.
 *
 * Each element is encoded as two-digit ID, two-digit decimal length (01..99),
 * then `length` characters of data. Templates (root IDs 32, 33, 35-39) carry
 * nested TLV in their data; this codec is unaware of nesting.
 *
 * Not part of the public API.
 */

export interface TlvElement {
  readonly id: string;
  readonly value: string;
}

const TWO_DIGIT = /^\d{2}$/;
const MAX_VALUE_LENGTH = 99;
const HEADER_LENGTH = 4;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function normalizeId(id: string): string {
  const padded = id.length === 1 ? `0${id}` : id;
  if (!TWO_DIGIT.test(padded)) {
    throw new ElqrEncodeError(`invalid TLV id "${id}" (must be two digits)`);
  }
  return padded;
}

export function encodeElement(id: string | number, value: string): string {
  const tag = normalizeId(typeof id === "number" ? String(id) : id);
  if (value.length > MAX_VALUE_LENGTH) {
    throw new ElqrEncodeError(
      `value for id ${tag} is ${value.length} chars; TLV max is ${MAX_VALUE_LENGTH}`,
    );
  }
  return `${tag}${pad2(value.length)}${value}`;
}

export function encodeElements(elements: Iterable<TlvElement>): string {
  let out = "";
  for (const el of elements) {
    out += encodeElement(el.id, el.value);
  }
  return out;
}

export function parseElements(input: string): TlvElement[] {
  const out: TlvElement[] = [];
  let i = 0;
  while (i < input.length) {
    if (i + HEADER_LENGTH > input.length) {
      throw new ElqrParseError(
        `truncated TLV header at offset ${i} (need ${HEADER_LENGTH} chars, got ${input.length - i})`,
      );
    }
    const id = input.slice(i, i + 2);
    const lenStr = input.slice(i + 2, i + HEADER_LENGTH);
    if (!TWO_DIGIT.test(id)) {
      throw new ElqrParseError(`invalid TLV id "${id}" at offset ${i}`);
    }
    if (!TWO_DIGIT.test(lenStr)) {
      throw new ElqrParseError(`invalid TLV length "${lenStr}" at offset ${i + 2}`);
    }
    const len = Number(lenStr);
    const start = i + HEADER_LENGTH;
    const end = start + len;
    if (end > input.length) {
      throw new ElqrParseError(
        `TLV value for id ${id} declares length ${len} but only ${input.length - start} chars remain`,
      );
    }
    out.push({ id, value: input.slice(start, end) });
    i = end;
  }
  return out;
}

