/**
 * Public types for the ELQR library.
 *
 * Every field links to the corresponding ID in the ELQR spec.
 */

/** Link type — ID "01". `static` (11) lets the payer set the amount; `dynamic` (12) is single-use. */
export type ElqrLinkType = "static" | "dynamic";

/** Whether an additional field is shown to the payer — ID 35-39 / SubID visible_state. */
export type ElqrFieldVisibility = "visible" | "hidden";

/** Service / provider information — ID "32". */
export interface ElqrServiceInfo {
  /** SubID 00 — unique provider identifier (≤ 32 chars). Required. */
  providerId: string;
  /**
   * SubID 01 — service code. Spec v1.3.1 declares ≤ 10 chars, but real producers
   * (e.g. Finik) routinely emit 14+; the builder accepts up to 32 to match.
   * Required if {@link ElqrMerchantInfo.merchantId} is absent.
   */
  serviceCode?: string;
  /** SubID 10 — recipient identifier within the service (≤ 32 chars). */
  recipientId?: string;
  /** SubID 11 — transaction id within the recipient system (≤ 32 chars). */
  transactionId?: string;
  /** SubID 12 — whether the payer may edit the amount. Defaults to `true` per spec. */
  amountEditable?: boolean;
  /** SubID 13 — whether the payer may edit the recipient id. Defaults to `true` per spec. */
  recipientIdEditable?: boolean;
}

/** Merchant info template — ID "33". */
export interface ElqrMerchantInfo {
  /** SubID 00 — unique merchant id (≤ 32 chars). Required if {@link ElqrServiceInfo.serviceCode} is absent. */
  merchantId?: string;
  /** SubID 01 — service display name (≤ 32 chars). */
  serviceName?: string;
}

/**
 * A single additional field — one entry within an ID 35-39 template.
 *
 * Encoded as `key:label:value:title:visible_state` per spec.
 * The five parts must not contain `:` themselves.
 */
export interface ElqrAdditionalField {
  /** Field identifier in the provider's information system. */
  key: string;
  /** Internal label. */
  label: string;
  /** Raw value. */
  value: string;
  /** Display value shown to the user when `visible === "visible"`. */
  title: string;
  /** Visibility flag — `visible` (11) or `hidden` (12). */
  visible: ElqrFieldVisibility;
}

/**
 * Payload accepted by {@link buildLink} and {@link buildFragment}.
 * The checksum (ID 63) is computed automatically.
 */
export interface ElqrPayload {
  /** ID "00" — spec version. Defaults to {@link SPEC_VERSION} (`"01"`). */
  version?: string;
  /** ID "01" — link type (`static` or `dynamic`). */
  type: ElqrLinkType;
  /** ID "32" — mandatory service / provider info. */
  service: ElqrServiceInfo;
  /** ID "33" — optional merchant info. */
  merchant?: ElqrMerchantInfo;
  /** ID "34" — comment shown to the payer (≤ 32 chars). */
  comment?: string;
  /**
   * ID 35-39 — additional fields. The builder packs them into templates 35→39
   * automatically; throws {@link ElqrEncodeError} if they don't fit.
   */
  additionalFields?: ElqrAdditionalField[];
  /** ID "52" — Merchant Category Code (exactly 4 digits per ISO 18245). */
  mcc: string;
  /** ID "53" — ISO 4217 numeric currency code (3 digits). Defaults to {@link DEFAULT_CURRENCY} (`"417"`, KGS). */
  currency?: string;
  /**
   * ID "54" — amount in tyiyn (1 KGS = 100 tyiyn). Omit to let the payer enter it.
   *
   * Accepts `bigint`, `number`, or a positive digit string for ergonomic input;
   * normalized to `bigint` internally. Must be > 0; max 13 digits.
   */
  amount?: bigint | number | string;
  /** ID "59" — provider display name (≤ 25 chars). */
  providerName: string;
}

/**
 * Result of {@link parseLink} / {@link parseLinkVerified}.
 *
 * `version`, `currency`, and `checksum` are always present (parser fails otherwise);
 * `amount` is returned as a `bigint` (symmetric with the builder).
 */
export interface ElqrParsed {
  /** ID "00". */
  version: string;
  /** ID "01". */
  type: ElqrLinkType;
  /** ID "32". */
  service: ElqrServiceInfo;
  /** ID "33", if present. */
  merchant?: ElqrMerchantInfo;
  /** ID "34", if present. */
  comment?: string;
  /** Flattened additional fields collected from any of ID 35-39 templates. */
  additionalFields?: ElqrAdditionalField[];
  /** ID "52". */
  mcc: string;
  /** ID "53". */
  currency: string;
  /** ID "54" in tyiyn, if present. `0n` is possible — some producers emit it for static links. */
  amount?: bigint;
  /** ID "59". */
  providerName: string;
  /** ID "63" — 4-character hex checksum exactly as it appears in the input. */
  checksum: string;
}

/** Options for {@link buildLink}. */
export interface BuildOptions {
  /** Base URL whose fragment will carry the payment details. Defaults to {@link DEFAULT_BASE_URL}. */
  baseUrl?: string;
  /**
   * Percent-encode non-ASCII characters in the fragment for safer URL transport
   * (e.g. when the link is sent over SMS or email). The QR code itself stores
   * raw UTF-8, so leave this `false` (the default) for QR generation.
   */
  percentEncode?: boolean;
}
