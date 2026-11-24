const axios = require('axios');
const config = require('./config');

/**
 * Parses Telebirr, CBE, and Bank of Abyssinia (BOA) SMS confirmation messages.
 * Extracts transactionId / Reference Number and paid amount in ETB.
 */
function parsePaymentSms(text) {
  if (!text || typeof text !== 'string') {
    return { isValid: false, bank: null, transactionId: null, amount: null };
  }

  const cleanText = text.replace(/\s+/g, ' ').trim();
  let bank = null;
  let transactionId = null;
  let amount = null;

  // 1. Detect Bank / Provider
  if (/telebirr|ቴሌብር|የግብይት\s*ቁጥር/i.test(cleanText)) {
    bank = 'TELEBIRR';
  } else if (/Commercial Bank of Ethiopia|CBE|FT[A-Z0-9]{8,}/i.test(cleanText)) {
    bank = 'CBE';
  } else if (/Abyssinia|BOA/i.test(cleanText)) {
    bank = 'BOA';
  }

  // 2. Extract Transaction / Reference ID
  const txPatterns = [
    /(?:የግብይት\s*ቁጥር|Transaction\s*(?:ID|Number|No\.?|Ref)|Ref(?:erence)?\s*(?:No\.?|Number|ID)?)[:\s#-]*([A-Z0-9]{8,20})/i,
    /\b(FT[A-Z0-9]{8,16})\b/i,
    /\b([A-Z0-9]{10,14})\b/ // Telebirr alphanumeric IDs e.g. BHG49X21KL
  ];

  for (const pattern of txPatterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      transactionId = match[1].toUpperCase();
      break;
    }
  }

  // 3. Extract Amount in ETB / Birr
  const amountPatterns = [
    /(?:ETB|Birr|ብር)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:ETB|Birr|ብር)/i,
    /(?:amount\s*of|transferred|credited\s*with|paid)\s*(?:ETB|Birr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
  ];

  for (const pattern of amountPatterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ''));
      if (!Number.isNaN(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  const isValid = Boolean(transactionId && amount && amount > 0);
  return {
    isValid,
    bank: bank || 'BANK_TRANSFER',
    transactionId,
    amount
  };
}

/**
 * Pushes approved Offline Shop deposit to ATD Control Dashboard (sync-api.onrender.com)
 * Includes 3 automatic retries with exponential backoff and instant Admin alert on failure.
 */
async function pushToControlDashboard({ shop_id, username, amount, ref_id }, notifyAdminsFn) {
  const cleanShopId = String(shop_id || '').trim().toUpperCase();
  const cleanUsername = String(username || '').trim();
  const cleanRefId = String(ref_id || '').trim().toUpperCase();

  const payload = {
    shop_id: cleanShopId,
    username: cleanUsername,
    client_username: cleanUsername, // ፖርታሉ (sync-api.onrender.com) Client Username ባዶ እንዳያደርግ
    amount: Number(amount),
    ref_id: cleanRefId,
    transaction_id: cleanRefId
  };

  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(config.syncApi.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.syncApi.secret}`
        },
        timeout: 12000
      });

      if (response.status >= 200 && response.status < 300) {
        return { success: true, data: response.data, attempts: attempt };
      }
    } catch (err) {
      lastError = err.response?.data?.message || err.message || 'Unknown Sync API error';
      console.error(`❌ [SYNC API Attempt ${attempt}/${maxAttempts} Failed]:`, lastError);

      if (attempt < maxAttempts) {
        const backoffMs = attempt * 2000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  // All 3 retries failed -> Alert Admin immediately
  if (typeof notifyAdminsFn === 'function') {
    const alertMsg =
      `🚨 *CRITICAL: ATD Control Dashboard Sync Failed (3/3 Attempts)*\n\n` +
      `🏪 *Shop ID:* \`${payload.shop_id}\`\n` +
      `👤 *Username:* \`${payload.username}\`\n` +
      `💰 *Amount:* ${payload.amount} ETB\n` +
      `🧾 *Ref ID:* \`${payload.ref_id}\`\n` +
      `❌ *Error:* ${lastError}\n\n` +
      `⚠️ Supabase ባላንስ ተጨምሯል ነገር ግን ወደ \`sync-api.onrender.com\` አልተላከም። እባክዎ በእጅ (Manual) ያስተካክሉ!`;

    await notifyAdminsFn(alertMsg);
  }

  return { success: false, error: lastError };
}

module.exports = {
  parsePaymentSms,
  pushToControlDashboard
};
