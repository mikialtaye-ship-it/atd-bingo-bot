'use strict';
const { Markup } = require('telegraf');
const env = require('../config/env');
const { mainMenu } = require('../utils/keyboards');
const { getOfflineAppFileId } = require('../services/supabase');

const INSTALL_GUIDE = `
📦 <b>ኦፍላይን አፕ ጫን — ሙሉ መመሪያ</b>

<b>1️⃣ .zip ፋይሉን አውጣው (Extract/Unzip)</b>
   • Windows: ፋይሉን Right-click → "Extract All"
   • ወይም WinRAR / 7-Zip ተጠቀም

<b>2️⃣ Windows Antivirus (Defender) ማሳሰቢያ</b>
   • Windows Defender ቢያስጠነቅቅ፦
     Settings → Virus &amp; threat protection
     → Manage settings → Exclusions → Add an exclusion
     → Folder → የ ATD Bingo ፎልደርን ምረጥ

<b>3️⃣ አፕሊኬሽኑን ሩጥ</b>
   • <code>ATD-Bingo.exe</code> ፋይሉን ሁለቴ ጠቅ ያድርጉ
   • ወይም Right-click → "Run as administrator"

<b>4️⃣ ⚠️ ወሳኝ ማሳሰቢያ — ባላንስ Sync</b>
   ጨዋታ ሲጫወቱ ዋይፋይ አያስፈልግም ✅
   ነገር ግን ከ Telegram ቦቱ ያጸደቁትን ዲፖዚት ወደ አፕ ለማስገባት፦

   ✅ ኮምፒውተርዎን ዋይፋይ (ኢንተርኔት) ጋር ያገናኙ
   ✅ ATD Bingo አፕ ውስጥ <b>"Sync Balance"</b> ቁልፍ ይንኩ
   ✅ ጥቂት ሰኮንዶች ቆዩ — ባላንሱ ይታደሳል
`.trim();

module.exports = function registerOfflineAppHandler(bot) {

  bot.hears('📲 ኦፍላይን አፕ አውርድ', async (ctx) => {
    // Try cached Telegram file_id first (zero bandwidth cost for repeat downloads)
    const fileId = await getOfflineAppFileId();

    if (fileId) {
      try {
        await ctx.replyWithDocument(fileId, {
          caption:    INSTALL_GUIDE,
          parse_mode: 'HTML',
        });
        return;
      } catch (err) {
        console.error('[OFFLINE APP] cached file_id send failed:', err.message);
        // Fall through to URL/fallback
      }
    }

    // Fallback: show download URL button
    const buttons = [];
    if (env.OFFLINE_APP_DOWNLOAD_URL) {
      buttons.push([Markup.button.url('⬇️ አፕ አውርድ (Download Link)', env.OFFLINE_APP_DOWNLOAD_URL)]);
    }
    buttons.push([Markup.button.callback('↩️ ዋና ምናሌ', 'back:main')]);

    await ctx.replyWithHTML(
      (env.OFFLINE_APP_DOWNLOAD_URL
        ? '📲 <b>ATD Bingo ኦፍላይን አፕ</b> — ከዚህ ሊንክ ያውርዱ:\n\n'
        : '⚠️ ፋይሉ ገና አልቀረበም። Admin ብዙም ሳይቆዩ ያስቀምጣሉ።\n\n') +
      INSTALL_GUIDE,
      Markup.inlineKeyboard(buttons),
    );
  });

  bot.action('back:main', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('ዋና ምናሌ 👇', mainMenu);
  });
};
