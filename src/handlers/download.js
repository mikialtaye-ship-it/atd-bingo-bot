const supabaseService = require('../services/supabase');
const config = require('../config');
const amharicKeyboards = require('../keyboards/amharicKeyboards');
const logger = require('../utils/logger');

const downloadHandler = {
  /**
   * Handle user clicking "📲 ኦፍላይን አፕ አውርድ"
   */
  async handleDownload(ctx) {
    try {
      const appInfo = await supabaseService.getOfflineAppInfo();

      const installationGuide =
        `📲 <b>የ ATD Bingo ኦፍላይን አፕሊኬሽን ማውረጃ</b> 🇪🇹🎱\n\n` +
        `📦 <b>የፋይል ስም:</b> <code>${appInfo.fileName}</code>\n` +
        `📏 <b>መጠን:</b> <code>${appInfo.fileSize}</code>\n` +
        `🔖 <b>ቨርዥን:</b> <code>${appInfo.version}</code>\n\n` +
        `═══════════════════════\n` +
        `📋 <b>ቀላል የአጫጫን መመሪያ (Step-by-Step):</b>\n` +
        `1️⃣ ፋይሉን (.zip) ካወረዱ በኋላ <b>Extract (Unzip)</b> ያድርጉት።\n` +
        `2️⃣ ፎልደሩ ውስጥ ያለውን የ <b>ATD Bingo</b> አፕሊኬሽን ይጫኑ (Install)።\n` +
        `3️⃣ ምንም ኢንተርኔት ሳያስፈልግዎት <b>ኦፍላይን</b> በነፃነት ይጫወቱ!\n` +
        `═══════════════════════`;

      // 1. If Telegram Cached FILE_ID is available, send document directly (supports up to 2GB)
      if (appInfo.fileId) {
        const sendingStatusMsg = await ctx.reply('⏳ ኦፍላይን አፕሊኬሽኑን በቴሌግራም በመላክ ላይ፣ እባክዎ ትንሽ ይጠብቁ...');

        try {
          await ctx.replyWithDocument(appInfo.fileId, {
            caption: installationGuide,
            parse_mode: 'HTML',
            ...amharicKeyboards.offlineAppButtons(appInfo.downloadUrl),
          });

          // Delete temporary sending status message
          try {
            await ctx.deleteMessage(sendingStatusMsg.message_id);
          } catch (_) {}

          return;
        } catch (docErr) {
          logger.warn(`Failed to send cached file_id (${appInfo.fileId}): ${docErr.message}. Falling back to download link.`);
          // If sending cached document fails (e.g. invalid file_id), continue to fallback URL
        }
      }

      // 2. Fallback Direct Download Link
      const fallbackUrl = appInfo.downloadUrl || config.offlineApp.downloadUrl;

      if (fallbackUrl) {
        const linkMsg =
          `${installationGuide}\n\n` +
          `🌐 ፋይሉን በቀጥታ ከታች ባለው ሊንክ ማውረድ ይችላሉ:`;

        return ctx.replyWithHTML(linkMsg, amharicKeyboards.offlineAppButtons(fallbackUrl));
      }

      // 3. If neither is available yet (initial setup)
      const pendingMsg =
        `${installationGuide}\n\n` +
        `⚠️ የአፕሊኬሽኑ አዲስ ዝመና በመጫን ላይ ነው። እባክዎ ከጥቂት ደቂቃዎች በኋላ በድጋሚ ይሞክሩ ወይም አድሚኑን በ 📞 እርዳታ ያግኙ።`;

      return ctx.replyWithHTML(pendingMsg, amharicKeyboards.supportMenu());
    } catch (err) {
      logger.error('Error in handleDownload:', err.message);
      return ctx.reply('የኦፍላይን አፕሊኬሽን በማውረድ ላይ ችግር አጋጥሟል። እባክዎ 📞 እርዳታ የሚለውን ይጫኑ።');
    }
  },

  /**
   * Admin /setapp command
   * Allows ADMIN_TELEGRAM_ID to upload a .zip file directly to Telegram (up to 2GB)
   * and save its file_id, file_size, and version automatically into Supabase app_settings.
   */
  async handleSetApp(ctx) {
    const senderId = String(ctx.from.id);
    const adminId = String(config.adminTelegramId).trim();

    // Verify Admin rights
    if (adminId && senderId !== adminId) {
      return ctx.reply('⛔ ይህንን ትዕዛዝ መጠቀም የሚችሉት ዋናው አድሚን ብቻ ናቸው።');
    }

    let document = null;
    let version = 'v2.4.0';

    // Check if command has arguments (e.g. /setapp v2.5.0)
    const text = ctx.message.text || ctx.message.caption || '';
    const match = text.match(/\/setapp(?:\s+([^\s]+))?/i);
    if (match && match[1]) {
      version = match[1].trim();
    }

    // Check if command is a reply to a document
    if (ctx.message.reply_to_message && ctx.message.reply_to_message.document) {
      document = ctx.message.reply_to_message.document;
    } else if (ctx.message.document) {
      // Or command was sent as a caption with the document
      document = ctx.message.document;
    }

    if (!document) {
      const instructions =
        `ℹ️ <b>የኦፍላይን አፕሊኬሽን መመዝገቢያ (/setapp) አጠቃቀም:</b>\n\n` +
        `የ ATD Bingo ኦፍላይን አፕሊኬሽን (~170MB .zip) ወደ ቦቱ ለማስገባት:\n\n` +
        `1️⃣ የ <code>.zip</code> ፋይሉን በ Telegram Desktop ወይም Mobile ወደዚህ ቦት ይላኩ (Send Document)።\n` +
        `2️⃣ ፋይሉ ላይ Caption አድርገው <code>/setapp v2.4.0</code> ብለው ይጻፉ።\n` +
        `ወይም\n` +
        `3️⃣ የተላከውን ፋይል <b>Reply</b> በማድረግ <code>/setapp v2.4.0</code> ብለው ይላኩ።\n\n` +
        `ይህ የቴሌግራም <b>Cached FILE_ID</b> በ Supabase ውስጥ በቋሚነት ይመዘግባል!`;

      return ctx.replyWithHTML(instructions);
    }

    // Format file size
    const sizeInMB = (document.file_size / (1024 * 1024)).toFixed(1);
    const fileName = document.file_name || 'ATD-Bingo-Offline.zip';
    const fileId = document.file_id;

    const savingMsg = await ctx.reply('⏳ የአፕሊኬሽን መረጃዎችን ወደ Supabase በማስቀመጥ ላይ...');

    try {
      const saved = await supabaseService.saveOfflineAppInfo({
        fileId,
        fileName,
        fileSize: `${sizeInMB} MB`,
        version,
      });

      try {
        await ctx.deleteMessage(savingMsg.message_id);
      } catch (_) {}

      if (saved) {
        const confirmMsg =
          `✅ <b>የ ATD Bingo ኦፍላይን አፕሊኬሽን በተሳካ ሁኔታ ተመዝግቧል!</b>\n\n` +
          `📦 <b>የፋይል ስም:</b> <code>${fileName}</code>\n` +
          `📏 <b>መጠን:</b> <code>${sizeInMB} MB</code>\n` +
          `🔖 <b>ቨርዥን:</b> <code>${version}</code>\n` +
          `🆔 <b>Telegram File ID:</b>\n<code>${fileId}</code>\n\n` +
          `🎉 አሁን ማንኛውም ተጠቃሚ <b>📲 ኦፍላይን አፕ አውርድ</b> ሲል ይህ ፋይል በቴሌግራም በቀጥታ ይላክላቸዋል!`;

        logger.success(`Offline app registered by admin: ${fileName} (${sizeInMB} MB, ${version})`);
        return ctx.replyWithHTML(confirmMsg);
      } else {
        return ctx.reply('❌ ፋይሉን በ Supabase app_settings ውስጥ ማስቀመጥ አልተቻለም። እባክዎ የ Supabase ግንኙነትን ያረጋግጡ።');
      }
    } catch (err) {
      logger.error('Error saving app info via /setapp:', err.message);
      return ctx.reply(`❌ ስህተት ተከስቷል: ${err.message}`);
    }
  },
};

module.exports = downloadHandler;
