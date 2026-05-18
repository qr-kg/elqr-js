/**
 * Internal mappings between domain-level enum literals and the on-wire
 * two-digit codes used by the ELQR spec (e.g. "11"/"12" for link type,
 * visibility, and boolean flags).
 *
 * Not part of the public API.
 */

import type { ElqrFieldVisibility, ElqrLinkType } from "../types";

export const LINK_TYPE_CODE = {
  static: "11",
  dynamic: "12",
} as const satisfies Record<ElqrLinkType, string>;

export const VISIBILITY_CODE = {
  visible: "11",
  hidden: "12",
} as const satisfies Record<ElqrFieldVisibility, string>;

const TRUE_CODE = "11";
const FALSE_CODE = "12";

export function boolToCode(flag: boolean): string {
  return flag ? TRUE_CODE : FALSE_CODE;
}

export function codeToBool(code: string): boolean | undefined {
  if (code === TRUE_CODE) return true;
  if (code === FALSE_CODE) return false;
  return undefined;
}

export function codeToLinkType(code: string): ElqrLinkType | undefined {
  if (code === LINK_TYPE_CODE.static) return "static";
  if (code === LINK_TYPE_CODE.dynamic) return "dynamic";
  return undefined;
}

export function codeToVisibility(code: string): ElqrFieldVisibility | undefined {
  if (code === VISIBILITY_CODE.visible) return "visible";
  if (code === VISIBILITY_CODE.hidden) return "hidden";
  return undefined;
}
