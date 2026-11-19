const supabaseService = require('../services/supabase');
const amharicKeyboards = require('../keyboards/amharicKeyboards');
const logger = require('../utils/logger');

const balanceHandler = {
  /**
   * Show user's current wallet balance
   */
  async handleMyBalance(ctx) {
    const telegramId = ctx.from.id;

    try {
      const user = await supabaseService.getUserByTelegramId(telegramId);

      if (!user) {
        return ctx.replyWithHTML(
          '⚠️ <b>አካውንትዎ አልተገናኘም!</b>\n\nእባክዎ መጀመሪያ /start ብለው በመላክ አካውንትዎን ያገናኙ።',
          amharicKeyboards.requestContact()
        );
      }

      const balance = Number(user.balance || 0).toFixed(2);
      const balanceMsg =
        `💳 <b>የእርስዎ ATD Bingo የሂሳብ መረጃ:</b>\n\n` +
        `👤 <b>የተጠቃሚ ስም:</b> <code>${user.username || 'ተጫዋች'}</code>\n` +
        `📱 <b>ስልክ ቁጥር:</b> <code>${user.phone || 'N/A'}</code>\n` +
        `💰 <b>የአሁን ባላንስ:</b> <code>${balance} ብር (ETB)</code>\n` +
        `🟢 <b>የአካውንት ሁኔታ:</b> ንቁ (Active)\n\n` +
        `ባላንስዎን ለመጨመር ከታች ያለውን <b>"💰 ባላንስ መሙላት"</b> ቁልፍ ይጫኑ:`;

      return ctx.replyWithHTML(balanceMsg, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 ባላንስ መሙላት (Deposit)', callback_data: 'deposit_select_method' }],
            [{ text: '📜 የግብይት ታሪክ (History)', callback_data: 'view_history' }],
          ],
        },
      });
    } catch (err) {
      logger.error('Error fetching user balance:', err.message);
      return ctx.reply('ባላንስ በመመልከት ላይ ችግር አጋጥሟል። እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።');
    }
  },

  /**
   * Show recent transaction history
   */
  async handleHistory(ctx) {
    const telegramId = ctx.from.id;

    try {
      const user = await supabaseService.getUserByTelegramId(telegramId);

      if (!user) {
        return ctx.replyWithHTML(
          '⚠️ <b>አካውንትዎ አልተገናኘም!</b>\n\nእባክዎ መጀመሪያ /start ብለው በመላክ አካውንትዎን ያገናኙ።',
          amharicKeyboards.requestContact()
        );
      }

      const txns = await supabaseService.getUserRecentTransactions(user.id, 7);

      if (!txns || txns.length === 0) {
        const emptyMsg =
          `📜 <b>የግብይት ታሪክ (Transaction History):</b>\n\n` +
          `እስካሁን ምንም ዓይነት የተቀማጭ ወይም የክፍያ ታሪክ የለዎትም።\n\n` +
          `አሁኑኑ ባላንስ በመሙላት በ ATD Bingo ጨዋታዎችን መጀመር ይችላሉ!`;

        return ctx.replyWithHTML(emptyMsg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💰 አሁኑኑ ባላንስ ሙላ', callback_data: 'deposit_select_method' }],
            ],
          },
        });
      }

      let historyText = `📜 <b>የቅርብ ጊዜ የግብይት ታሪክ (Recent Deposits):</b>\n\n`;

      txns.forEach((tx, idx) => {
        let statusBadge = '⏳ በመጠባበቅ ላይ';
        if (tx.status === 'approved') statusBadge = '✅ ጸድቋል';
        if (tx.status === 'rejected') statusBadge = '❌ ውድቅ የተደረገ';

        let methodBadge = tx.payment_method;
        if (tx.payment_method === 'TELEBIRR') methodBadge = '📱 ቴሌብር';
        if (tx.payment_method === 'CBE') methodBadge = '🏦 ንግድ ባንክ';
        if (tx.payment_method === 'BOA') methodBadge = '🏛️ አቢሲኒያ ባንክ';

        const dateStr = new Date(tx.created_at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

        const amountFormatted = Number(tx.amount).toFixed(2);

        historyText +=
          `<b>${idx + 1}. ${statusBadge} - ${amountFormatted} ብር</b>\n` +
          `   • ዘዴ: ${methodBadge}\n` +
          `   • መለያ: <code>${tx.transaction_id}</code>\n` +
          `   • ቀን: ${dateStr}\n\n`;
      });

      return ctx.replyWithHTML(historyText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 አዲስ ባላንስ ሙላ', callback_data: 'deposit_select_method' }],
            [{ text: '🔙 ወደ ዋና ሜኑ', callback_data: 'menu_main' }],
          ],
        },
      });
    } catch (err) {
      logger.error('Error fetching transaction history:', err.message);
      return ctx.reply('የግብይት ታሪክ በማምጣት ላይ ችግር አጋጥሟል። እባክዎ እንደገና ይሞክሩ።');
    }
  },
};

module.exports = balanceHandler;
