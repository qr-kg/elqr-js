import { ElqrEncodeError } from "../errors";

/**
 * Length and format assertions used by the builder.
 * Not part of the public API.
 */

export const DIGITS = /^\d+$/;
export const FOUR_DIGITS = /^\d{4}$/;
export const THREE_DIGITS = /^\d{3}$/;

export function assertMaxLen(value: string, max: number, label: string): void {
  if (value.length > max) {
    throw new ElqrEncodeError(`${label} is ${value.length} chars; max is ${max}`);
  }
}

export function assertDigits(value: string, label: string): void {
  if (!DIGITS.test(value)) {
    throw new ElqrEncodeError(`${label} "${value}" must contain digits only`);
  }
}

export function assertNoColon(value: string, label: string): void {
  if (value.includes(":")) {
    throw new ElqrEncodeError(
      `${label} "${value}" contains ":", which is the additional-field separator`,
    );
  }
}

/**
 * Reject astral (non-BMP) code points. The TLV length is counted in UTF-16 code units
 * to match what real Kyrgyz banks produce; astral characters occupy two code units in
 * JS strings but are visually one symbol, which would desync `length` from intent.
 *
 * Iterating with `for..of` yields one entry per code point, so the count diverges from
 * `string.length` exactly when astral chars are present.
 */
export function assertNoAstralChars(value: string, label: string): void {
  let codePoints = 0;
  for (const _ of value) codePoints += 1;
  if (codePoints !== value.length) {
    throw new ElqrEncodeError(
      `${label} contains astral (non-BMP) code points; ELQR TLV length is counted in UTF-16 code units and would desync`,
    );
  }
}
