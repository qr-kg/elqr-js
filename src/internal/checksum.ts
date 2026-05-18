/**
 * Internal SHA-256 helper for the ID "63" checksum.
 *
 * Per ELQR spec §"Контрольная сумма":
 *   1. Concatenate the TLV-encoded payload for all fields with id 00-90 except 63.
 *   2. Encode as UTF-8.
 *   3. SHA-256.
 *   4. Hex-encode, strip dashes, take the last 4 characters.
 *
 * Uses Web Crypto (`globalThis.crypto.subtle`) — Node ≥ 20, modern browsers.
 *
 * Not part of the public API.
 */

import { ElqrError } from "../errors";

const CHECKSUM_LENGTH = 4;

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

export async function computeChecksum(tlvWithoutChecksum: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new ElqrError(
      "Web Crypto subtle API is unavailable; ELQR checksum requires globalThis.crypto.subtle",
    );
  }
  const bytes = new TextEncoder().encode(tlvWithoutChecksum);
  let digest: ArrayBuffer;
  try {
    digest = await subtle.digest("SHA-256", bytes);
  } catch (cause) {
    throw new ElqrError(
      `SHA-256 digest failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  const hex = toHex(digest).replace(/-/g, "");
  return hex.slice(-CHECKSUM_LENGTH);
}
