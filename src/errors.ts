/**
 * Error hierarchy for the ELQR library.
 *
 * Catch `ElqrError` to handle any failure originating from this library,
 * or narrow to a specific subclass for finer-grained handling.
 */

/** Base class for every error thrown by this library. */
export class ElqrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ElqrError";
  }
}

/** Thrown when input to a builder is invalid (length, format, missing required fields). */
export class ElqrEncodeError extends ElqrError {
  constructor(message: string) {
    super(message);
    this.name = "ElqrEncodeError";
  }
}

/** Thrown when an input fragment cannot be parsed as ELQR (malformed TLV, missing required IDs). */
export class ElqrParseError extends ElqrError {
  constructor(message: string) {
    super(message);
    this.name = "ElqrParseError";
  }
}

/** Thrown when the embedded checksum (ID 63) does not match the recomputed SHA-256 of the payload. */
export class ElqrChecksumError extends ElqrError {
  constructor(message = "checksum mismatch (ID 63)") {
    super(message);
    this.name = "ElqrChecksumError";
  }
}
