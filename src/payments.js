const referencePatterns = [
  /(?:transaction\s*(?:id|no\.?|number)|txn\s*(?:id|no\.?|number)|reference\s*(?:no\.?|number|id)|ref\s*(?:no\.?|number|id)|የግብይት\s*ቁጥር)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,})/i,
];

const amountPatterns = [
  /(?:ETB|ብር)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
  /([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:ETB|ብር)/i,
];

export function parsePaymentMessage(text = '') {
  const reference = referencePatterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean);
  const rawAmount = amountPatterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean);
  const amount = rawAmount ? Number(rawAmount.replaceAll(',', '')) : NaN;

  if (!reference || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
  return { transactionId: reference.toUpperCase(), amount: amount.toFixed(2) };
}

export function parseSmsPayload(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  return [payload.message, payload.text, payload.body, payload.sms]
    .find((value) => typeof value === 'string') || '';
}