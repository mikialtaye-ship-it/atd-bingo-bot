/**
 * Ethiopian Financial SMS Parser (Telebirr, CBE, Bank of Abyssinia)
 * Handles both English and Amharic formats, plus manual reference entries.
 */

class SMSParser {
  /**
   * Parse payment confirmation SMS or text
   * @param {string} text - Raw SMS or user entered text
   * @returns {Object} { success, provider, transactionId, amount, rawText, error }
   */
  parse(text) {
    if (!text || typeof text !== 'string') {
      return { success: false, error: 'Empty text provided' };
    }

    const cleanText = text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

    // Detect Payment Provider
    const provider = this.detectProvider(cleanText);

    // Extract Transaction ID
    const transactionId = this.extractTransactionId(cleanText, provider);

    // Extract Amount
    const amount = this.extractAmount(cleanText);

    if (!transactionId) {
      return {
        success: false,
        provider,
        amount,
        rawText: cleanText,
        error: 'INVALID_TRANSACTION_ID',
      };
    }

    if (!amount || amount <= 0) {
      return {
        success: false,
        provider,
        transactionId,
        rawText: cleanText,
        error: 'INVALID_AMOUNT',
      };
    }

    return {
      success: true,
      provider,
      transactionId: transactionId.toUpperCase(),
      amount: parseFloat(amount.toFixed(2)),
      rawText: cleanText,
    };
  }

  /**
   * Determine bank / payment provider based on SMS keywords
   */
  detectProvider(text) {
    const lower = text.toLowerCase();

    // Telebirr indicators
    if (
      lower.includes('telebirr') ||
      lower.includes('ቴሌብር') ||
      lower.includes('ethio telecom') ||
      lower.includes('የአገልግሎት ክፍያ') ||
      lower.includes('ቀሪ ሒሳብዎ') ||
      lower.includes('transferred etb')
    ) {
      return 'TELEBIRR';
    }

    // CBE indicators
    if (
      lower.includes('cbe') ||
      lower.includes('ንግድ ባንክ') ||
      lower.includes('commercial bank') ||
      /FT[0-9A-Z]{8,14}/i.test(text)
    ) {
      return 'CBE';
    }

    // Bank of Abyssinia indicators
    if (
      lower.includes('abyssinia') ||
      lower.includes('አቢሲኒያ') ||
      lower.includes('boa')
    ) {
      return 'BOA';
    }

    return 'OTHER';
  }

  /**
   * Extract Transaction ID or Reference Number
   */
  extractTransactionId(text, provider) {
    // 1. Specific CBE FT Code (e.g. FT263229P8W0)
    const cbeMatch = text.match(/\b(FT[0-9A-Za-z]{8,14})\b/i);
    if (cbeMatch) {
      return cbeMatch[1].trim();
    }

    // 2. Standard labeled patterns (English & Amharic)
    const labeledPatterns = [
      /(?:Transaction\s*ID|Txn\s*ID|Trans\s*ID|Txn\s*No|Transaction\s*No|የግብይት\s*ቁጥር|የግብይት\s*መለያ|መለያ\s*ቁጥር|የማጣቀሻ\s*ቁጥር|Ref\s*No|Reference\s*No|Ref|Txn)[\s*:\-–#]+([A-Za-z0-9]{6,20})/i,
      /(?:is|ነው)\s*([A-Za-z0-9]{8,18})\b/i,
      /(?:code|ኮድ)[\s*:\-–]+([A-Za-z0-9]{6,20})/i,
    ];

    for (const pattern of labeledPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // 3. Telebirr alphanumeric code heuristic (typically 10-12 uppercase alphanumeric characters)
    if (provider === 'TELEBIRR') {
      const telebirrCodeMatch = text.match(/\b([A-Z0-9]{10,12})\b/);
      if (telebirrCodeMatch) {
        return telebirrCodeMatch[1].trim();
      }
    }

    // 4. Single-token fallback if user just pasted the transaction ID itself
    const singleToken = text.trim();
    if (/^[A-Za-z0-9]{6,20}$/.test(singleToken)) {
      return singleToken;
    }

    return null;
  }

  /**
   * Extract Amount in ETB / ብር
   */
  extractAmount(text) {
    // Patterns matching amounts with ETB or ብር
    const amountPatterns = [
      // ETB 100.00 or ETB 1,500.50
      /(?:ETB|ብር)\s*[:\-–]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
      // 100.00 ETB or 100 ብር
      /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:ETB|ብር)/i,
      // የብር 100.00 or የብር 100
      /(?:የብር|መጠን|debited\s*with|transferred)\s*[:\-–]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
    ];

    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const cleanedNumber = match[1].replace(/,/g, '');
        const val = parseFloat(cleanedNumber);
        if (!isNaN(val) && val > 0) {
          return val;
        }
      }
    }

    // Fallback: look for two numbers on a line, e.g. "FT12345678 250"
    const numberMatches = text.match(/\b([0-9]+(?:\.[0-9]{1,2})?)\b/g);
    if (numberMatches) {
      for (const numStr of numberMatches) {
        const val = parseFloat(numStr);
        // Exclude year numbers (like 2026), phone numbers, or tiny amounts
        if (val >= 10 && val <= 500000 && val !== 2024 && val !== 2025 && val !== 2026) {
          return val;
        }
      }
    }

    return null;
  }
}

module.exports = new SMSParser();
