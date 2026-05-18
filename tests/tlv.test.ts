import { test } from "node:test";
import assert from "node:assert/strict";

import {
  encodeElement,
  encodeElements,
  parseElements,
} from "../src/internal/tlv";
import { ElqrEncodeError, ElqrParseError } from "../src/errors";

test("encodeElement: pads single-digit length to two digits", () => {
  assert.equal(encodeElement("00", "01"), "000201");
});

test("encodeElement: accepts numeric id and pads to two digits", () => {
  assert.equal(encodeElement(5, "x"), "0501x");
});

test("encodeElement: rejects non-numeric id", () => {
  assert.throws(() => encodeElement("XX", "v"), ElqrEncodeError);
});

test("encodeElement: rejects value > 99 chars", () => {
  const long = "a".repeat(100);
  assert.throws(() => encodeElement("00", long), ElqrEncodeError);
});

test("encodeElement: accepts empty value (length 00)", () => {
  assert.equal(encodeElement("00", ""), "0000");
});

test("encodeElement: accepts max-length value (99 chars)", () => {
  const value = "a".repeat(99);
  assert.equal(encodeElement("00", value), `0099${value}`);
});

test("encodeElement: counts UTF-16 code units (Cyrillic = 1 unit each)", () => {
  // "Привет" is 6 characters in JS string length (BMP code units)
  assert.equal(encodeElement("01", "Привет"), "0106Привет");
});

test("encodeElements: concatenates in order", () => {
  const out = encodeElements([
    { id: "00", value: "01" },
    { id: "01", value: "11" },
  ]);
  assert.equal(out, "0002010102 11".replace(" ", ""));
});

test("parseElements: roundtrip with encodeElements", () => {
  const elements = [
    { id: "00", value: "01" },
    { id: "32", value: "0006abcdef" },
    { id: "63", value: "abcd" },
  ];
  const decoded = parseElements(encodeElements(elements));
  assert.deepEqual(decoded, elements);
});

test("parseElements: rejects truncated header", () => {
  assert.throws(() => parseElements("000"), ElqrParseError);
});

test("parseElements: rejects non-numeric id", () => {
  assert.throws(() => parseElements("XX02ab"), ElqrParseError);
});

test("parseElements: rejects non-numeric length", () => {
  assert.throws(() => parseElements("00XXab"), ElqrParseError);
});

test("parseElements: rejects declared length beyond input", () => {
  assert.throws(() => parseElements("0099abc"), ElqrParseError);
});

test("parseElements: handles empty value (length 00)", () => {
  assert.deepEqual(parseElements("0000"), [{ id: "00", value: "" }]);
});

test("parseElements: empty input yields empty array", () => {
  assert.deepEqual(parseElements(""), []);
});
