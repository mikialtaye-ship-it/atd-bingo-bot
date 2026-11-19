const amharicKeyboards = require('../keyboards/amharicKeyboards');
const config = require('../config');

const supportHandler = {
  /**
   * Main Customer Support Message
   */
  async handleSupportMenu(ctx) {
    const supportPhone = config.supportPhone;
    const adminUsername = config.supportTelegramUsername;

    const message =
      `📞 <b>የ ATD Bingo የደንበኞች አገልግሎት እና ድጋፍ</b> 🇪🇹\n\n` +
      `ለማንኛውም ጥያቄ፣ አስተያየት ወይም አፋጣኝ ድጋፍ በሚከተሉት መንገዶች ያግኙን:\n\n` +
      `☎️ <b>የቀጥታ ስልክ ጥሪ:</b> <code>${supportPhone}</code>\n` +
      `💬 <b>የቴሌግራም አድሚን:</b> @${adminUsername}\n` +
      `⏰ <b>የስራ ሰዓት:</b> 24/7 (ያለማቋረጥ ሁልጊዜ ክፍት ነው)\n\n` +
      `═══════════════════════\n` +
      `💡 <b>ፈጣን መልስ ለማግኘት ከታች ካሉት ተደጋጋሚ ጥያቄዎች (FAQ) አንዱን ይምረጡ:</b>`;

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(message, {
        parse_mode: 'HTML',
        ...amharicKeyboards.supportMenu(),
      });
    }

    return ctx.replyWithHTML(message, amharicKeyboards.supportMenu());
  },

  /**
   * FAQ: Delayed Payment / Deposit issue
   */
  async handleFaqPayment(ctx) {
    await ctx.answerCbQuery();

    const faqText =
      `💳 <b>ክፍያ ዘገየብኝ? (Payment Troubleshooting):</b>\n\n` +
      `1️⃣ <b>የማጣሪያ ጊዜ:</b> አብዛኛውን ጊዜ የቴሌብር እና የባንክ ክፍያዎች በ <b>1 እስከ 5 ደቂቃዎች</b> ውስጥ ተጣርተው ይገባሉ።\n\n` +
      `2️⃣ <b>SMS በትክክል መላኩን ያረጋግጡ:</b> ክፍያ ከፈጸሙ በኋላ ከቴሌብር ወይም ከባንክ የደረሰዎትን SMS ሙሉውን ኮፒ አድርገው በ <b>💰 ባላንስ መሙላት</b> በኩል መላክዎን ያረጋግጡ።\n\n` +
      `3️⃣ <b>ደረሰኝ ፎቶ:</b> SMS ካልደረሰዎት የከፈሉበትን የባንክ ደረሰኝ Screenshot ፎቶ በቀጥታ ለቦቱ ይላኩ።\n\n` +
      `4️⃣ <b>አፋጣኝ እርዳታ:</b> ክፍያው ከ 10 ደቂቃ በላይ ከዘገየ የግብይት ቁጥሩን በመያዝ ለአድሚን በ @${config.supportTelegramUsername} ይላኩ ወይም በ <code>${config.supportPhone}</code> ይደውሉልን።`;

    return ctx.replyWithHTML(faqText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬 ለአድሚን መልዕክት ላክ', url: `https://t.me/${config.supportTelegramUsername}` }],
          [{ text: '🔙 ወደ እርዳታ ሜኑ ተመለስ', callback_data: 'menu_support' }],
        ],
      },
    });
  },

  /**
   * FAQ: Offline App installation help
   */
  async handleFaqApp(ctx) {
    await ctx.answerCbQuery();

    const faqText =
      `📲 <b>ኦፍላይን አፕ አልከፈተልኝም? (App Installation Guide):</b>\n\n` +
      `የ ATD Bingo ኦፍላይን አፕሊኬሽን የተዘጋጀው በ <b>.zip</b> ፎርማት ነው። ለመጫን የሚከተሉትን ቀላል ደረጃዎች ይከተሉ:\n\n` +
      `1️⃣ <b>Extract (Unzip) ያድርጉ:</b> የወረደውን <code>ATD-Bingo-Offline.zip</code> ፋይል ላይ <b>Right Click</b> (ወይም በስልክዎ My Files ላይ) በመንካት <b>Extract All (ፍታ)</b> የሚለውን ይጫኑ።\n\n` +
      `2️⃣ <b>ጫን (Install):</b> ከተፈታው ፎልደር ውስጥ ያለውን የ ATD Bingo setup ፋይል ሁለት ጊዜ በመጫን ይጫኑት።\n\n` +
      `3️⃣ <b>ኦፍላይን ይጫወቱ:</b> አፕሊኬሽኑ ከተጫነ በኋላ ምንም ዓይነት የበይነመረብ (Internet) ግንኙነት ሳያስፈልገው በፍጥነት ይሰራል።\n\n` +
      `ፋይሉን ማውረድ ካልቻሉ ከታች ያለውን <b>📲 አፕሊኬሽኑን አውርድ</b> ይጫኑ።`;

    return ctx.replyWithHTML(faqText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📲 አፕሊኬሽኑን አውርድ', callback_data: 'menu_download' }],
          [{ text: '🔙 ወደ እርዳታ ሜኑ ተመለስ', callback_data: 'menu_support' }],
        ],
      },
    });
  },

  /**
   * FAQ: Account Linking help
   */
  async handleFaqAccount(ctx) {
    await ctx.answerCbQuery();

    const faqText =
      `🔗 <b>አካውንት እንዴት ላገናኝ? (Account Linking Guide):</b>\n\n` +
      `1️⃣ <b>በስልክ ቁጥር:</b> ከታች ያለውን <b>"📱 ስልክ ቁጥር ላክ"</b> የሚለውን ቁልፍ ሲጫኑ ቴሌግራም ስልክ ቁጥርዎን በቀጥታ ያገናኝልዎታል።\n\n` +
      `2️⃣ <b>በ Username:</b> በ ATD Bingo ጨዋታ ላይ የተመዘገቡበትን የተጠቃሚ ስም (Username) ጽፈው ለቦቱ ይላኩ።\n\n` +
      `3️⃣ <b>አዲስ ተጠቃሚ ከሆኑ:</b> እስካሁን በ ATD Bingo ያልተመዘገቡ ከሆነ አድሚኑን በ @${config.supportTelegramUsername} በማናገር በደቂቃዎች ውስጥ አዲስ አካውንት ማስከፈት ይችላሉ።`;

    return ctx.replyWithHTML(faqText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬 አድሚን አናግር', url: `https://t.me/${config.supportTelegramUsername}` }],
          [{ text: '🔙 ወደ እርዳታ ሜኑ ተመለስ', callback_data: 'menu_support' }],
        ],
      },
    });
  },
};

module.exports = supportHandler;
