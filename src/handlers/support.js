'use strict';
const env = require('../config/env');
const { mainMenu, supportKeyboard } = require('../utils/keyboards');
const {
  getOnlineWallet,
  getTelegramLink,
  getUserTransactions,
} = require('../services/supabase');

// ════════════════════════════════════════════════════════════════
//  AMHARIC FAQ ANSWERS
// ════════════════════════════════════════════════════════════════
const FAQ_ANSWERS = {
  'faq:sync': `💳 <b>ባላንስ Sync አልሆነልኝም?</b>

ይህ ችግር ብዙ ጊዜ ኮምፒውተሩ ወይም ዳሽቦርዱ ከኢንተርኔት ጋር ስላልተገናኘ ነው።

✅ <b>ደረጃ-ደረጃ መፍትሔ፦</b>
1. ኮምፒውተርዎ ዋይፋይ (Wi-Fi) ወይም LAN ጋር እንደተገናኘ ያረጋግጡ
2. Chrome / Edge ውስጥ ማንኛውም ድህረ-ገጽ ሊከፈት ይገባዋል
3. ATD Bingo አፕ ውስጥ ሲጫወቱ ወደ <b>"Balance"</b> ሄዶ
4. <b>"Sync Balance"</b> ቁልፍ ይንኩ
5. ጥቂት ሰኮንዶች ቆዩ — ባላንሱ ይታደሳል ✅

⚠️ <i>Render server ሊነሳ ደቂቃ 1–2 ሊፈጅ ይችላል (free tier)</i>`,

  'faq:app': `📲 <b>ኦፍላይን አፕ አልከፈተልኝም?</b>

<b>ምክንያቶችና መፍትሔዎች፦</b>

<b>1️⃣ .zip ፋይሉን አስወጣ (Extract)</b>
   ፋይሉን Right-click → Extract All
   ወይም WinRAR / 7-Zip ተጠቀም

<b>2️⃣ Windows Antivirus ማሳሰቢያ</b>
   Settings → Virus &amp; threat protection → Exclusions
   → Add an exclusion → Folder → የ ATD Bingo ፎልደርን ምረጥ

<b>3️⃣ Windows Version ፍለጋ</b>
   Windows 10 ወይም 11 (64-bit) ያስፈልጋል
   ዊንዶው 7 / 8 ሊሠራ አይችልም

<b>4️⃣ Admin ሆኖ ሩጥ</b>
   .exe ፋይሉን Right-click → "Run as administrator"`,

  'faq:shoplink': `🔗 <b>Shop ID እና Username እንዴት ላገናኝ?</b>

<b>ዘዴ 1 — ስልክ ቁጥር (ቀላሉ):</b>
• /start → "📱 ስልክ ቁጥሬን አጋራ" ቁልፍ ይንኩ
• ስልክ ቁጥርዎ ከ ACTIVE ቤት ጋር ካለ ወዲያው ይገናናሉ

<b>ዘዴ 2 — Shop ID + Username:</b>
• 💰 ባላንስ መሙላት → 🏪 ለኦፍላይን ቤት
• Shop ID ያስገቡ: <code>SHOP-BF24C9E7</code>
• Username ያስገቡ: <code>adis</code>
• ቤቱ ACTIVE ሆኖ ከተገኘ ወዲያው ይገናናሉ ✅

⚠️ Shop ID ወይም Username የሚያውቁ ካልሆኑ Admin ያነጋግሩ`,

  'faq:online': `🎮 <b>ኦንላይን ጌም (Bingo/Keno/Aviator) እንዴት ልጫወት?</b>

<b>1️⃣ ኦንላይን Wallet ሙሉ:</b>
   • 💰 ባላንስ መሙላት → 🎮 ለኦንላይን ጨዋታ
   • ቴሌብር/CBE/Abyssinia ወደ አካውንቱ ክፈሉ
   • Screenshot ወይም SMS ያስቀምጡ
   • Admin ሲፈቅዱ Wallet ሰከንዶች ውስጥ ይሞላል

<b>2️⃣ ጨዋታ ጀምሩ:</b>
   • 🎮 ኦንላይን ጨዋታዎች ምናሌ ይምረጡ
   • ፈለጉትን ጨዋታ ይምረጡ
   • Telegram ሳይወጡ ጨዋታ ይጫወቱ! 🎉

🚧 <i>ጨዋታዎቹ ቅርቡ ቀን ይጀምራሉ — ይጠብቁ!</i>`,
};

// ════════════════════════════════════════════════════════════════
module.exports = function registerSupportHandler(bot) {

  // ── 💳 የእኔ ባላንስ ────────────────────────────────────────────
  bot.hears('💳 የእኔ ባላንስ', async (ctx) => {
    const userId = ctx.from.id;
    const [wallet, link] = await Promise.all([
      getOnlineWallet(userId),
      getTelegramLink(userId),
    ]);

    const onlineBal = wallet ? parseFloat(wallet.balance).toLocaleString('en-ET') : '0.00';
    let msg = `💳 <b>የእኔ ባላንስ</b>\n\n`;
    msg += `🎮 ኦንላይን Wallet: <b>${onlineBal} ETB</b>\n`;

    if (link?.shop_id) {
      msg +=
        `\n🏪 ኦፍላይን ቤት:\n` +
        `   Shop ID: <code>${link.shop_id}</code>\n` +
        `   Username: <code>${link.username}</code>\n\n` +
        `ℹ️ ኦፍላይን ባላንሱን ለማየት ATD Bingo አፕ ወስጥ <b>"Sync Balance"</b> ይንኩ።`;
    } else {
      msg +=
        `\n🏪 ኦፍላይን: ቤት አልተገናኘም።\n` +
        `💰 ባላንስ መሙላት → 🏪 ለኦፍላይን ቤት ይሞክሩ።`;
    }

    await ctx.replyWithHTML(msg, mainMenu);
  });

  // ── 📜 የግብይት ታሪክ ───────────────────────────────────────────
  bot.hears('📜 የግብይት ታሪክ', async (ctx) => {
    const userId = ctx.from.id;
    const txs    = await getUserTransactions(userId, 10);

    if (!txs.length) {
      return ctx.replyWithHTML(
        `📜 <b>የግብይት ታሪክ</b>\n\nምንም ግብይት የለም። ቀድሞ ያልሞሉ ይሆናል።`,
        mainMenu,
      );
    }

    const icon  = (s) => s === 'APPROVED' ? '✅' : s === 'REJECTED' ? '❌' : '⏳';
    const label = (t) => t === 'OFFLINE_SHOP' ? '🏪 ኦፍላይን' : '🎮 ኦንላይን';

    let msg = `📜 <b>ቅርብ ጊዜ ግብይቶች (ምርጥ 10)</b>\n\n`;
    for (const tx of txs) {
      const date = new Date(tx.created_at).toLocaleDateString('en-GB');
      const ref  = (tx.transaction_id || 'N/A').substring(0, 18);
      msg +=
        `${icon(tx.status)} <b>${(tx.requested_amount || 0).toLocaleString()} ETB</b> — ${label(tx.type)}\n` +
        `   📅 ${date}  Ref: <code>${ref}</code>\n\n`;
    }

    await ctx.replyWithHTML(msg, mainMenu);
  });

  // ── 📞 እርዳታ ────────────────────────────────────────────────
  bot.hears('📞 እርዳታ', async (ctx) => {
    await ctx.replyWithHTML(
      `📞 <b>እርዳታ ማዕከል</b>\n\n` +
      `📱 ስልክ 1: <b>${env.SUPPORT_PHONE_1}</b>\n` +
      `📱 ስልክ 2: <b>${env.SUPPORT_PHONE_2}</b>\n` +
      `💬 Telegram: @${env.SUPPORT_TELEGRAM_USERNAME}\n\n` +
      `❓ <b>ተዛማጅ ጥያቄዎች (FAQs)</b> — ከዚህ ይምረጡ 👇`,
      supportKeyboard,
    );
  });

  // ── FAQ Callbacks ─────────────────────────────────────────────
  for (const [action, answer] of Object.entries(FAQ_ANSWERS)) {
    bot.action(action, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.replyWithHTML(answer, supportKeyboard);
    });
  }
};
