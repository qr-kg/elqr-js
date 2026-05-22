/**
 * elqr — TypeScript library for building and parsing payment links per the
 * ELQR specification (Kyrgyzstan's national instant-payment QR system).
 *
 * @see ELQR specification (internal reference)
 */

export { buildFragment, buildLink, createBuilder } from "./build";
export { parseLink, parseLinkVerified, verifyChecksum } from "./parse";

export {
  ElqrError,
  ElqrEncodeError,
  ElqrParseError,
  ElqrChecksumError,
} from "./errors";

export {
  DEFAULT_BASE_URL,
  DEFAULT_CURRENCY,
  KGS_TYIYN_PER_UNIT,
  SPEC_VERSION,
} from "./constants";

export type {
  BuildOptions,
  ElqrAdditionalField,
  ElqrFieldVisibility,
  ElqrLinkType,
  ElqrMerchantInfo,
  ElqrParsed,
  ElqrPayload,
  ElqrServiceInfo,
} from "./types";
