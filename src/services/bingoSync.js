const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class BingoSyncService {
  /**
   * Notify main game controller (bingo-sync-api) of an approved deposit
   * @param {Object} param0
   * @param {string} param0.userId - Supabase user UUID
   * @param {number} param0.amount - Deposited amount in ETB
   * @param {number} param0.newBalance - New updated balance in ETB
   * @param {string} param0.transactionId - Unique transaction reference
   */
  async notifyBalanceUpdated({ userId, amount, newBalance, transactionId }) {
    if (!config.bingoSyncApiUrl) {
      logger.info('BINGO_SYNC_API_URL not configured. Skipping external controller sync.');
      return { success: true, skipped: true };
    }

    const endpoint = `${config.bingoSyncApiUrl}/api/balance-updated`;
    const payload = {
      user_id: userId,
      amount: Number(amount),
      new_balance: Number(newBalance),
      transaction_id: transactionId,
      timestamp: new Date().toISOString(),
    };

    try {
      logger.info(`Syncing balance update to controller: ${endpoint}`, JSON.stringify(payload));

      const response = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ATD-Bingo-Bot/1.0',
        },
        timeout: 8000, // 8-second timeout
      });

      logger.success(`Game controller synced successfully. Status: ${response.status}`);
      return { success: true, data: response.data };
    } catch (error) {
      // Log warning but don't fail transaction since Supabase is the primary source of truth
      const errDetails = error.response
        ? `Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        : error.message;
      logger.warn(`Failed to sync with bingo-sync-api (${endpoint}): ${errDetails}`);
      return { success: false, error: errDetails };
    }
  }
}

module.exports = new BingoSyncService();
