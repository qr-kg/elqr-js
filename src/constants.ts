/**
 * Public constants for the ELQR library.
 */

/** Current ELQR spec version supported — emitted as the value of ID "00". */
export const SPEC_VERSION = "01";

/** ISO 4217 numeric code for the Kyrgyz som, used as the default for ID "53". */
export const DEFAULT_CURRENCY = "417";

/**
 * ELQR routing host used when the caller does not supply a custom `baseUrl`.
 * Banking apps register their deep-link handlers against this host, so it's
 * the safe default for QR codes consumed by Kyrgyz banking apps.
 */
export const DEFAULT_BASE_URL = "https://pay.payqr.kg/";

/** Number of tyiyn in one Kyrgyz som — useful when converting human-readable amounts. */
export const KGS_TYIYN_PER_UNIT = 100n;
