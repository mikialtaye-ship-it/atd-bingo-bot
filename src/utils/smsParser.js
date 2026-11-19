'use strict';

/**
 * Ethiopian Bank / Telebirr SMS Parser
 *
 * Extracts { bank, transactionId, amount } from SMS text.
 * Supports:
 *   • Telebirr  — "የግብይት ቁጥር" / "Transaction ID"
 *   • CBE       — FT / RFT reference numbers
 *   • Abyssinia — "Ref No" / "Reference"
 *
 * Returns null if no supported format is detected.
 */
function parseSms(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  // ── Telebirr ──────────────────────────────────────────────────
  // ID pattern: "የግብይት ቁጥር: 12345" or "Transaction ID: TXN123"
  const telebirrId = t.match(
    /(?:የግብይት\s*ቁጥር|Transaction\s*ID)\s*[:\-]?\s*([A-Z0-9]{6,20})/i
  );
  // Amount pattern: "ብር 500.00" or "ETB 500" or "500.00 ETB" or "500.00 Birr"
  const telebirrAmt =
    t.match(/(?:ብር|ETB|Birr)\s+([\d,]+(?:\.\d{1,2})?)/i) ||
    t.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:ብር|ETB|Birr)/i);

  if (telebirrId) {
    return {
      bank:          'Telebirr',
      transactionId: telebirrId[1].trim(),
      amount:        telebirrAmt ? parseFloat(telebirrAmt[1].replace(/,/g, '')) : null,
    };
  }

  // ── CBE (Commercial Bank of Ethiopia) ─────────────────────────
  // Reference: FT12345678901234 or RFT12345678
  const cbeRef = t.match(/\b(R?FT\d{8,16})\b/i);
  const cbeAmt =
    t.match(/(?:Amount|Birr|ETB)\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    t.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:Birr|ETB)/i);

  if (cbeRef) {
    return {
      bank:          'CBE',
      transactionId: cbeRef[1].toUpperCase(),
      amount:        cbeAmt ? parseFloat(cbeAmt[1].replace(/,/g, '')) : null,
    };
  }

  // ── Abyssinia Bank (BOA) ───────────────────────────────────────
  // Ref patterns: "Ref No: AB123456" / "Reference: 123456" / "TRN: 123456"
  const boaRef = t.match(
    /(?:Ref(?:erence)?\s*(?:No\.?)?|TRN)\s*[:\-]?\s*([A-Z0-9]{6,20})/i
  );
  const boaAmt =
    t.match(/(?:Amount|Birr|ETB)\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    t.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:Birr|ETB)/i);

  if (boaRef) {
    return {
      bank:          'Abyssinia',
      transactionId: boaRef[1].trim(),
      amount:        boaAmt ? parseFloat(boaAmt[1].replace(/,/g, '')) : null,
    };
  }

  return null;
}

module.exports = { parseSms };
