import { test } from "node:test";
import assert from "node:assert/strict";

import { parseLink, verifyChecksum } from "../src/parse";

/**
 * Real-world ELQR links from Kyrgyz banks. Used to verify that the parser
 * handles producer quirks (non-canonical field ordering, mixed-case checksums,
 * amount=0 in static links, percent-encoded Cyrillic) and that the checksum
 * algorithm matches what real banks produce.
 *
 * Sourced from MBank, DCB, O!Bank (dengi.kg), Bakai Bank, and Finik QR exports.
 */

const DCB = "https://pay.payqr.kg#00020101021132790009qr.dcb.kg010413251012996554185519112601jz8h34f4kwb0d8myn2qs5gsm12021113021233390005340770126Simbank-%D0%BF%D0%BE%20%D0%BD%D0%BE%D0%BC%D0%B5%D1%80%D1%83%20%D1%82%D0%B5%D0%BB%D0%B5%D1%84%D0%BE%D0%BD%D0%B0520473995907Simbank530341763045e93";

const MBANK = "https://app.mbank.kg/qr/#00020101021132440012c2c.mbank.kg01020210129965541855191302125204999953034175909KIRILL%20B.63047129";

// MBank c2b (business): Cyrillic transactionId (company name in quotes), long
// providerName (24/25 chars), comment containing literal ":" which must NOT be
// treated as the additional-field separator (only ID 35-39 uses that).
const MBANK_C2B = "https://app.mbank.kg/qr/#00020101021132750012c2b.mbank.kg010202101610332200022805291123%D0%9E%D1%81%D0%9E%D0%9E%20%22%D0%94%D0%B8%D0%B4%D0%B6%D0%B8%D1%82%D0%B0%D0%BB%20%D0%A1%D0%BE%D0%BB%D1%8E%D1%88%D0%BD%D1%81%221302123422mbiz%3A27621834%3A186603085204999953034175924OsOO%20Didzhital%20Soliushns6304a891";

const OBANK = "https://api.dengi.o.kg/#00020101021132680012p2p.dengi.kg01048580111213834069925110129965541855191202111302123409%D0%9A%D0%98%D0%A0%D0%98%D0%9B%D0%9B%20%D0%91.520473995303417540105906O%21Bank6304B9B7";

// O!Bank with a fixed amount (5556.00 KGS) and amountEditable=false.
const OBANK_WITH_AMOUNT = "https://api.dengi.o.kg/#00020101021132680012p2p.dengi.kg01048580111255772592582110129965541855191202121302123409%D0%9A%D0%98%D0%A0%D0%98%D0%9B%D0%9B%20%D0%91.52047399530341754065556005906O%21Bank630485D0";

// Bakai Bank: single-digit serviceCode, Latin merchantId in ID 33, financial MCC.
const BAKAI = "https://bakai.app#00020101021132460011qr.bakai.kg010121016124201005350784913021233120008BAKAIAPP5204653853034175909Kirill%20B.63046764";

// Finik dynamic: type=12, serviceCode "averspay-items" (14 chars — exceeds the spec
// v1.3.1 limit of 10), 32-char hex recipient ID, amount 12412.00 KGS.
const FINIK_DYNAMIC = "https://qr.finik.kg/#00020101021232810011qr.finik.kg0114averspay-items10328606240d690d42e4b036d3dba9d0371a120212130212520448295303417540712412005908Finik-QR6304b127";

// Finik static (two snapshots with different recipient hashes): no amount, no SubID 12.
const FINIK_STATIC_A = "https://qr.finik.kg/#00020101021132750011qr.finik.kg0114averspay-items10326cc60f3c453e4286ae7bbbed49208ead1302125204482953034175908Finik-QR630424e3";
const FINIK_STATIC_B = "https://qr.finik.kg/#00020101021132750011qr.finik.kg0114averspay-items1032c728e5bb087648b0a96fb55a677b9e721302125204482953034175908Finik-QR63040ad6";

// Elcart p2p: providerName is a masked card number (with literal "*" and spaces),
// MCC 4822 (donations), and field order is 32 → 53 → 52 (currency before MCC).
const ELCART_P2P_CARD = "https://pay.payqr.kg#00020101021132700013p2p.elcart.kg0101110323435fba7738e54e59d8f3e8e664785d912021113021253034175204482259199417%20****%20****%20526963049EE1";

test("DCB Simbank: parses static link with merchant info and Cyrillic service name", () => {
  const parsed = parseLink(DCB);
  assert.equal(parsed.version, "01");
  assert.equal(parsed.type, "static");
  assert.equal(parsed.service.providerId, "qr.dcb.kg");
  assert.equal(parsed.service.serviceCode, "1325");
  assert.equal(parsed.service.recipientId, "996554185519");
  assert.equal(parsed.service.transactionId, "01jz8h34f4kwb0d8myn2qs5gsm");
  assert.equal(parsed.service.amountEditable, true);
  assert.equal(parsed.service.recipientIdEditable, false);
  assert.equal(parsed.merchant?.merchantId, "34077");
  assert.equal(parsed.merchant?.serviceName, "Simbank-по номеру телефона");
  assert.equal(parsed.mcc, "7399");
  assert.equal(parsed.currency, "417");
  assert.equal(parsed.providerName, "Simbank");
  assert.equal(parsed.amount, undefined);
  assert.equal(parsed.checksum, "5e93");
});

test("DCB Simbank: checksum verifies", async () => {
  assert.equal(await verifyChecksum(DCB), true);
});

test("MBank c2c: parses minimal static link", () => {
  const parsed = parseLink(MBANK);
  assert.equal(parsed.type, "static");
  assert.equal(parsed.service.providerId, "c2c.mbank.kg");
  assert.equal(parsed.service.serviceCode, "02");
  assert.equal(parsed.service.recipientId, "996554185519");
  assert.equal(parsed.service.recipientIdEditable, false);
  assert.equal(parsed.mcc, "9999");
  assert.equal(parsed.currency, "417");
  assert.equal(parsed.providerName, "KIRILL B.");
  assert.equal(parsed.checksum, "7129");
});

test("MBank c2c: checksum verifies", async () => {
  assert.equal(await verifyChecksum(MBANK), true);
});

test("MBank c2b: parses link with Cyrillic transactionId, structured comment, long providerName", () => {
  const parsed = parseLink(MBANK_C2B);
  assert.equal(parsed.type, "static");
  assert.equal(parsed.service.providerId, "c2b.mbank.kg");
  assert.equal(parsed.service.serviceCode, "02");
  assert.equal(parsed.service.recipientId, "1033220002280529");
  // transactionId carries a Cyrillic company name in quotes.
  assert.equal(parsed.service.transactionId, 'ОсОО "Диджитал Солюшнс"');
  assert.equal(parsed.service.recipientIdEditable, false);
  // Comment contains literal ":" — must be passed through verbatim, not split.
  assert.equal(parsed.comment, "mbiz:27621834:18660308");
  assert.equal(parsed.mcc, "9999");
  assert.equal(parsed.currency, "417");
  assert.equal(parsed.providerName, "OsOO Didzhital Soliushns");
  assert.equal(parsed.providerName.length, 24); // sanity: within the 25-char spec limit
  assert.equal(parsed.amount, undefined);
  assert.equal(parsed.checksum, "a891"); // lowercase
});

test("MBank c2b: lowercase checksum verifies", async () => {
  assert.equal(await verifyChecksum(MBANK_C2B), true);
});

test("O!Bank p2p: parses link with amount=0, comment, uppercase checksum", () => {
  const parsed = parseLink(OBANK);
  assert.equal(parsed.type, "static");
  assert.equal(parsed.service.providerId, "p2p.dengi.kg");
  assert.equal(parsed.service.serviceCode, "8580");
  assert.equal(parsed.service.transactionId, "138340699251");
  assert.equal(parsed.service.recipientId, "996554185519");
  assert.equal(parsed.service.amountEditable, true);
  assert.equal(parsed.service.recipientIdEditable, false);
  assert.equal(parsed.comment, "КИРИЛЛ Б.");
  assert.equal(parsed.mcc, "7399");
  assert.equal(parsed.amount, 0n);
  assert.equal(parsed.providerName, "O!Bank");
  assert.equal(parsed.checksum, "B9B7");
});

test("O!Bank p2p: uppercase checksum verifies (case-insensitive)", async () => {
  assert.equal(await verifyChecksum(OBANK), true);
});

test("O!Bank p2p (with amount): parses static link with fixed amount and locked editing", () => {
  const parsed = parseLink(OBANK_WITH_AMOUNT);
  assert.equal(parsed.type, "static");
  assert.equal(parsed.service.providerId, "p2p.dengi.kg");
  assert.equal(parsed.service.serviceCode, "8580");
  assert.equal(parsed.service.transactionId, "557725925821");
  assert.equal(parsed.service.recipientId, "996554185519");
  assert.equal(parsed.service.amountEditable, false);
  assert.equal(parsed.service.recipientIdEditable, false);
  assert.equal(parsed.comment, "КИРИЛЛ Б.");
  assert.equal(parsed.mcc, "7399");
  assert.equal(parsed.amount, 555600n); // 5556.00 KGS in tyiyn
  assert.equal(parsed.currency, "417");
  assert.equal(parsed.providerName, "O!Bank");
  assert.equal(parsed.checksum, "85D0");
});

test("O!Bank p2p (with amount): checksum verifies", async () => {
  assert.equal(await verifyChecksum(OBANK_WITH_AMOUNT), true);
});

test("Bakai: parses static link with single-digit serviceCode and Latin merchantId", () => {
  const parsed = parseLink(BAKAI);
  assert.equal(parsed.type, "static");
  assert.equal(parsed.service.providerId, "qr.bakai.kg");
  assert.equal(parsed.service.serviceCode, "2"); // exercises TLV length=01 path
  assert.equal(parsed.service.recipientId, "1242010053507849");
  assert.equal(parsed.service.recipientIdEditable, false);
  assert.equal(parsed.merchant?.merchantId, "BAKAIAPP");
  assert.equal(parsed.merchant?.serviceName, undefined);
  assert.equal(parsed.mcc, "6538");
  assert.equal(parsed.currency, "417");
  assert.equal(parsed.providerName, "Kirill B.");
  assert.equal(parsed.amount, undefined);
  assert.equal(parsed.checksum, "6764");
});

test("Bakai: checksum verifies", async () => {
  assert.equal(await verifyChecksum(BAKAI), true);
});

test("Finik dynamic: parses link type=12 with over-spec serviceCode and amount", () => {
  const parsed = parseLink(FINIK_DYNAMIC);
  assert.equal(parsed.type, "dynamic"); // FIRST real-world dynamic vector
  assert.equal(parsed.service.providerId, "qr.finik.kg");
  assert.equal(parsed.service.serviceCode, "averspay-items");
  assert.equal(parsed.service.serviceCode!.length, 14); // exceeds spec's 10-char limit
  assert.equal(parsed.service.recipientId, "8606240d690d42e4b036d3dba9d0371a"); // 32-char hex
  assert.equal(parsed.service.amountEditable, false);
  assert.equal(parsed.service.recipientIdEditable, false);
  assert.equal(parsed.mcc, "4829");
  assert.equal(parsed.currency, "417");
  assert.equal(parsed.amount, 1241200n); // 12412.00 KGS
  assert.equal(parsed.providerName, "Finik-QR");
  assert.equal(parsed.checksum, "b127");
});

test("Finik dynamic: checksum verifies", async () => {
  assert.equal(await verifyChecksum(FINIK_DYNAMIC), true);
});

test("Finik static A: parses static link with no amount", () => {
  const parsed = parseLink(FINIK_STATIC_A);
  assert.equal(parsed.type, "static");
  assert.equal(parsed.service.providerId, "qr.finik.kg");
  assert.equal(parsed.service.serviceCode, "averspay-items");
  assert.equal(parsed.service.recipientId, "6cc60f3c453e4286ae7bbbed49208ead");
  assert.equal(parsed.service.amountEditable, undefined); // no SubID 12 present
  assert.equal(parsed.service.recipientIdEditable, false);
  assert.equal(parsed.amount, undefined);
  assert.equal(parsed.checksum, "24e3");
});

test("Finik static A: checksum verifies", async () => {
  assert.equal(await verifyChecksum(FINIK_STATIC_A), true);
});

test("Finik static B: distinct recipient hash but identical structure to A", () => {
  const parsed = parseLink(FINIK_STATIC_B);
  assert.equal(parsed.service.recipientId, "c728e5bb087648b0a96fb55a677b9e72");
  assert.equal(parsed.checksum, "0ad6");
});

test("Finik static B: checksum verifies", async () => {
  assert.equal(await verifyChecksum(FINIK_STATIC_B), true);
});

test("Finik dynamic: builder now accepts 14-char serviceCode (real-world parity)", async () => {
  const { buildLink } = await import("../src/build");
  // Should not throw — limit relaxed from 10 to 32.
  const url = await buildLink({
    type: "dynamic",
    service: { providerId: "qr.finik.kg", serviceCode: "averspay-items" },
    mcc: "4829",
    providerName: "Finik-QR",
  });
  assert.ok(url.includes("0114averspay-items"));
});

test("Elcart p2p: masked-card providerName, donations MCC, non-canonical field order", () => {
  const parsed = parseLink(ELCART_P2P_CARD);
  assert.equal(parsed.type, "static");
  assert.equal(parsed.service.providerId, "p2p.elcart.kg");
  assert.equal(parsed.service.serviceCode, "1");
  assert.equal(parsed.service.recipientId, "3435fba7738e54e59d8f3e8e664785d9");
  assert.equal(parsed.service.amountEditable, true);
  assert.equal(parsed.service.recipientIdEditable, false);
  assert.equal(parsed.mcc, "4822"); // charitable donations
  assert.equal(parsed.currency, "417");
  assert.equal(parsed.amount, undefined);
  // Masked card number — first real-world fixture where providerName isn't a human name.
  assert.equal(parsed.providerName, "9417 **** **** 5269");
  assert.equal(parsed.providerName.length, 19);
  assert.equal(parsed.checksum, "9EE1");
});

test("Elcart p2p: checksum verifies despite non-canonical 53→52 ordering", async () => {
  // The producer emits ID 53 (currency) before ID 52 (MCC). Our verifier walks
  // elements in input order, so it must reproduce the SHA-256 over the same byte
  // sequence — proves the parser is truly order-agnostic.
  assert.equal(await verifyChecksum(ELCART_P2P_CARD), true);
});
