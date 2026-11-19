'use strict';
const env = require('../config/env');
const { mainMenu, onlineGamesKeyboard } = require('../utils/keyboards');
const { getOnlineWallet } = require('../services/supabase');

module.exports = function registerOnlineGamesHandler(bot) {

  // ── Main entry: 🎮 ኦንላይን ጨዋታዎች ─────────────────────────────
  bot.hears('🎮 ኦንላይን ጨዋታዎች (Bingo / Keno / Aviator)', async (ctx) => {
    const userId = ctx.from.id;
    const wallet = await getOnlineWallet(userId);
    const balance = wallet ? parseFloat(wallet.balance).toLocaleString('en-ET') : '0.00';

    await ctx.replyWithHTML(
      `🎮 <b>ኦንላይን ጨዋታዎች Hub</b>\n\n` +
      `💰 ኦንላይን Wallet ባላንስ: <b>${balance} ETB</b>\n\n` +
      `ጨዋታ ይምረጡ 👇`,
      onlineGamesKeyboard(
        env.ONLINE_BINGO_URL,
        env.ONLINE_KENO_URL,
        env.ONLINE_AVIATOR_URL,
        userId,
      ),
    );
  });

  // ── "Coming soon" pop-up alerts for unconfigured games ────────
  bot.action('game:coming_bingo', (ctx) =>
    ctx.answerCbQuery('🚧 ኦንላይን ቢንጎ በቅርብ ቀን ይከፈታል!', { show_alert: true })
  );
  bot.action('game:coming_keno', (ctx) =>
    ctx.answerCbQuery('🚧 ኬኖ በቅርብ ቀን ይከፈታል!', { show_alert: true })
  );
  bot.action('game:coming_aviator', (ctx) =>
    ctx.answerCbQuery('🚧 አቪዬተር በቅርብ ቀን ይከፈታል!', { show_alert: true })
  );
};
