const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const logger = require('../utils/logger');

class SupabaseService {
  constructor() {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      logger.warn('Supabase credentials not configured. Database operations will fail.');
      this.client = null;
      return;
    }

    // Initialize Supabase client with the service role key for atomic balance updates
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  /**
   * Find user linked to a Telegram ID
   */
  async getUserByTelegramId(telegramId) {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .maybeSingle();

      if (error) {
        logger.error(`Error finding user by telegram_id ${telegramId}:`, error.message);
        return null;
      }
      return data;
    } catch (err) {
      logger.error('Database query error in getUserByTelegramId:', err.message);
      return null;
    }
  }

  /**
   * Find user by Username or Shop ID
   */
  async getUserByUsernameOrPhone(identifier) {
    if (!this.client || !identifier) return null;
    try {
      const cleaned = identifier.trim();

      const { data, error } = await this.client
        .from('users')
        .select('*')
        .or(`username.ilike.${cleaned},shop_id.ilike.${cleaned}`)
        .maybeSingle();

      if (error) {
        logger.error(`Error finding user by identifier ${identifier}:`, error.message);
        return null;
      }
      return data;
    } catch (err) {
      logger.error('Database query error in getUserByUsernameOrPhone:', err.message);
      return null;
    }
  }

  /**
   * Link Telegram Account to existing user
   */
  async linkTelegramAccount(telegramId, telegramUsername, identifier) {
    if (!this.client) return { success: false, error: 'Database client not initialized' };

    try {
      const { data, error } = await this.client.rpc('link_telegram_account', {
        p_telegram_id: Number(telegramId),
        p_telegram_username: telegramUsername || null,
        p_identifier: identifier.trim(),
      });

      if (error) {
        logger.error('RPC link_telegram_account error:', error.message);
        return { success: false, error: error.message };
      }

      return data;
    } catch (err) {
      logger.error('Exception linking Telegram account:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Check if transaction ID has already been recorded (double-spending protection)
   */
  async checkDuplicateTransaction(transactionId) {
    if (!this.client || !transactionId) return false;
    try {
      const { data, error } = await this.client
        .from('transactions')
        .select('id, status, created_at')
        .eq('transaction_id', transactionId.trim().toUpperCase())
        .maybeSingle();

      if (error) {
        logger.error(`Error checking duplicate for ${transactionId}:`, error.message);
        return false;
      }

      return data !== null;
    } catch (err) {
      logger.error('Exception checking duplicate transaction:', err.message);
      return false;
    }
  }

  /**
   * Create a new pending deposit transaction
   */
  async createPendingTransaction({
    userId,
    telegramId,
    username,
    amount,
    paymentMethod,
    transactionId,
    receiptUrl = null,
    rawSms = null,
    source = 'telegram_bot',
  }) {
    if (!this.client) return { success: false, error: 'Database not connected' };

    try {
      const { data, error } = await this.client
        .from('transactions')
        .insert({
          user_id: userId,
          telegram_id: Number(telegramId),
          username: username || 'Unknown',
          amount: Number(amount),
          payment_method: paymentMethod,
          transaction_id: transactionId.trim().toUpperCase(),
          status: 'pending',
          receipt_url: receiptUrl,
          raw_sms: rawSms,
          source,
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to insert pending transaction:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true, transaction: data };
    } catch (err) {
      logger.error('Exception creating pending transaction:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Retrieve a transaction by its transaction_id
   */
  async getTransactionById(transactionId) {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .from('transactions')
        .select('*')
        .eq('transaction_id', transactionId.trim().toUpperCase())
        .maybeSingle();

      if (error) {
        logger.error(`Error getting transaction ${transactionId}:`, error.message);
        return null;
      }
      return data;
    } catch (err) {
      logger.error('Exception in getTransactionById:', err.message);
      return null;
    }
  }

  /**
   * Fetch recent transactions for a user
   */
  async getUserRecentTransactions(userId, limit = 5) {
    if (!this.client || !userId) return [];
    try {
      const { data, error } = await this.client
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error(`Error fetching transactions for user ${userId}:`, error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      logger.error('Exception in getUserRecentTransactions:', err.message);
      return [];
    }
  }

  /**
   * Call atomic PostgreSQL RPC to approve deposit and update user balance safely
   */
  async approveDepositRPC(transactionId, adminId = 'ADMIN') {
    if (!this.client) return { success: false, error: 'Database not initialized' };

    try {
      const { data, error } = await this.client.rpc('approve_deposit_and_sync_balance', {
        p_transaction_id: transactionId.trim().toUpperCase(),
        p_admin_id: String(adminId),
      });

      if (error) {
        logger.error('RPC approve_deposit_and_sync_balance error:', error.message);
        return { success: false, error: error.message };
      }

      return data;
    } catch (err) {
      logger.error('Exception approving deposit RPC:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Call atomic PostgreSQL RPC to reject deposit
   */
  async rejectDepositRPC(transactionId, reason = null, adminId = 'ADMIN') {
    if (!this.client) return { success: false, error: 'Database not initialized' };

    try {
      const { data, error } = await this.client.rpc('reject_deposit', {
        p_transaction_id: transactionId.trim().toUpperCase(),
        p_reason: reason,
        p_admin_id: String(adminId),
      });

      if (error) {
        logger.error('RPC reject_deposit error:', error.message);
        return { success: false, error: error.message };
      }

      return data;
    } catch (err) {
      logger.error('Exception rejecting deposit RPC:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get app setting by key
   */
  async getAppSetting(key, fallback = null) {
    if (!this.client) return fallback;
    try {
      const { data, error } = await this.client
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (error || !data) return fallback;
      return data.value || fallback;
    } catch (err) {
      logger.error(`Error fetching app setting ${key}:`, err.message);
      return fallback;
    }
  }

  /**
   * Set or update app setting
   */
  async setAppSetting(key, value, description = null) {
    if (!this.client) return false;
    try {
      const { error } = await this.client
        .from('app_settings')
        .upsert(
          {
            key,
            value: String(value),
            description: description || undefined,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      if (error) {
        logger.error(`Error setting app setting ${key}:`, error.message);
        return false;
      }
      return true;
    } catch (err) {
      logger.error(`Exception setting app setting ${key}:`, err.message);
      return false;
    }
  }

  /**
   * Persist complete offline app details updated via /setapp
   */
  async saveOfflineAppInfo({ fileId, fileName, fileSize, version }) {
    if (!this.client) return false;
    try {
      const updates = [
        this.setAppSetting('offline_app_file_id', fileId, 'Telegram cached file_id'),
        this.setAppSetting('offline_app_name', fileName || 'ATD-Bingo-Offline.zip', 'App package name'),
        this.setAppSetting('offline_app_size', fileSize || '168 MB', 'App archive size'),
        this.setAppSetting('offline_app_version', version || 'v2.4.0', 'Application version'),
      ];
      await Promise.all(updates);
      return true;
    } catch (err) {
      logger.error('Failed to save offline app info:', err.message);
      return false;
    }
  }

  /**
   * Retrieve cached offline app metadata
   */
  async getOfflineAppInfo() {
    const fileId = await this.getAppSetting('offline_app_file_id', config.offlineApp.fileId);
    const fileName = await this.getAppSetting('offline_app_name', config.offlineApp.name);
    const fileSize = await this.getAppSetting('offline_app_size', config.offlineApp.approxSize);
    const version = await this.getAppSetting('offline_app_version', config.offlineApp.version);
    const downloadUrl = await this.getAppSetting('offline_app_download_url', config.offlineApp.downloadUrl);

    return {
      fileId,
      fileName,
      fileSize,
      version,
      downloadUrl,
    };
  }
}

module.exports = new SupabaseService();
