const supabaseService = require('../services/supabase');
const sessionStore = require('../utils/sessionStore');
const amharicKeyboards = require('../keyboards/amharicKeyboards');
const logger = require('../utils/logger');

const backKeyboard = {
  reply_markup: {
    keyboard: [[{ text: '❌ ተመለስ' }]],
    resize_keyboard: true,
  },
};

const startHandler = {
  /**
   * Handle /start command
   */
  async handleStart(ctx) {
    const telegramId = ctx.from.id;
    const firstName = ctx.from.first_name || 'ተጫዋች';

    try {
      // 1. Check if user already linked
      const user = await supabaseService.getUserByTelegramId(telegramId);

      if (user) {
        const balance = Number(user.balance || 0).toFixed(2);
        const welcomeBackMsg =
          `👋 ሰላም <b>${user.username || firstName}</b>! እንኳን ወደ <b>ATD Bingo</b> በደህና መጡ!\n\n` +
          `🏪 <b>Shop ID:</b> <code>${user.shop_id || 'N/A'}</code>\n` +
          `👤 <b>Username:</b> <code>${user.username || 'N/A'}</code>\n` +
          `💳 <b>የአካውንትዎ ባላንስ:</b> <code>${balance} ብር</code>\n\n` +
          `ከታች ካሉት አማራጮች የሚፈልጉትን ይምረጡ:`;

        return ctx.replyWithHTML(welcomeBackMsg, amharicKeyboards.mainMenu());
      }

      // 2. User not linked yet - prompt for Shop ID or Username
      sessionStore.set(telegramId, { step: 'AWAITING_ACCOUNT_LINK' });

      const linkPrompt =
        `👋 ሰላም <b>${firstName}</b>!\n` +
        `እንኳን ወደ <b>ATD Bingo ኦፊሴላዊ ቦት</b> በደህና መጡ! 🇪🇹🎱\n\n` +
        `ይህ ቦት የሚከተሉትን አገልግሎቶች ይሰጥዎታል:\n` +
        `• የጨዋታ ባላንስዎን በቴሌብር እና በባንክ በቅጽበት መሙላት\n` +
        `• ፈጣኑን የ <b>ATD Bingo ኦፍላይን አፕሊኬሽን</b> በቀጥታ ማውረድ\n` +
        `• የሂሳብ ቀሪዎን እና የግብይት ታሪክዎን መከታተል\n` +
        `• የ 24/7 ፈጣን የደንበኞች ድጋፍ ማግኘት\n\n` +
        `⚠️ <b>ለመጀመር እባክዎ የ ATD Bingo አካውንትዎን ያገናኙ:</b>\n\n` +
        `👉 በ ATD Bingo የተመዘገቡበትን <b>Shop ID</b> (ምሳሌ፡ <code>SHOP-BF24C9E7</code>) ወይም <b>Username</b> (ምሳሌ፡ <code>adis</code>) እዚህ ይጻፉልን:`;

      return ctx.replyWithHTML(linkPrompt, backKeyboard);
    } catch (err) {
      logger.error('Error handling /start:', err.message);
      return ctx.reply(
        'ይቅርታ፣ ሲስተሙን በማገናኘት ላይ ችግር አጋጥሟል። እባክዎ ከጥቂት ደቂቃዎች በኋላ በድጋሚ ይሞክሩ።'
      );
    }
  },

  /**
   * Handle contact sharing fallback
   */
  async handleContact(ctx) {
    return ctx.reply(
      'እባክዎ ስልክ ቁጥር ሳይሆን የሱቅዎን Shop ID (ምሳሌ፡ SHOP-BF24C9E7) ወይም Username ይጻፉልን።',
      backKeyboard
    );
  },

  /**
   * Process identifier (Shop ID or Username) to link account
   */
  async linkWithIdentifier(ctx, telegramId, telegramUsername, identifier) {
    const searchingMsg = await ctx.reply('🔍 አካውንትዎን በማረጋገጥ ላይ፣ እባክዎ ትንሽ ይጠብቁ...');

    try {
      const result = await supabaseService.linkTelegramAccount(
        telegramId,
        telegramUsername,
        identifier
      );

      if (result && result.success) {
        sessionStore.clear(telegramId);

        const balance = Number(result.balance || 0).toFixed(2);
        const successMsg =
          `✅ <b>እንኳን ደስ አለዎት! አካውንትዎ በተሳካ ሁኔታ ተገናኝቷል።</b>\n\n` +
          `🏪 <b>Shop ID:</b> <code>${result.shop_id || 'N/A'}</code>\n` +
          `👤 <b>የተጠቃሚ ስም (Username):</b> <code>${result.username}</code>\n` +
          `💳 <b>የአሁን ባላንስዎ:</b> <code>${balance} ብር</code>\n\n` +
          `አሁን ከታች ባለው ሜኑ በመጠቀም ባላንስ መሙላት ወይም ኦፍላይን አፑን ማውረድ ይችላሉ:`;

        try {
          await ctx.deleteMessage(searchingMsg.message_id);
        } catch (_) {}

        return ctx.replyWithHTML(successMsg, amharicKeyboards.mainMenu());
      }

      // If user not found
      sessionStore.set(telegramId, { step: 'AWAITING_ACCOUNT_LINK' });

      try {
        await ctx.deleteMessage(searchingMsg.message_id);
      } catch (_) {}

      const notFoundMsg =
        `❌ <b>ይቅርታ፣ በ "${identifier}" የተመዘገበ አካውንት አልተገኘም!</b>\n\n` +
        `እባክዎ ትክክለኛውን መረጃ ማስገባትዎን ያረጋግጡ:\n` +
        `1. የሱቅ መለያ <b>Shop ID</b> (ምሳሌ፡ <code>SHOP-BF24C9E7</code>) ያስገቡ\n` +
        `2. ወይም ትክክለኛውን <b>Username</b> (ምሳሌ፡ <code>adis</code>) ያስገቡ\n\n` +
        `አዲስ ተጠቃሚ ከሆኑ ወይም ድጋፍ ከፈለጉ ከታች ያለውን <b>📞 እርዳታ</b> ቁልፍ ይጫኑ።`;

      return ctx.replyWithHTML(notFoundMsg, backKeyboard);
    } catch (err) {
      logger.error('Error linking account with identifier:', err.message);
      return ctx.reply('አካውንት በማገናኘት ላይ ችግር አጋጥሟል። እባክዎ እንደገና ይሞክሩ።');
    }
  },
};

module.exports = startHandler;
