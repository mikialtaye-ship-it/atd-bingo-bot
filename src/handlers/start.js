'use strict';
const { Markup } = require('telegraf');
const env = require('../config/env');
const {
  mainMenu,
  shareContactKeyboard,
  adminShopApprovalKeyboard,
  cancelKeyboard,
} = require('../utils/keyboards');
const {
  getTelegramLink,
  upsertTelegramLink,
  linkByPhone,
  ensureOnlineWallet,
  verifyShop,
  registerShop,
  activateShop,
  getShopById,
} = require('../services/supabase');

// ── Per-user registration state (in-memory) ──────────────────────
// For production multi-instance deploys, replace with Redis.
const regState = new Map();

module.exports = function registerStartHandler(bot) {

  // ════════════════════════════════════════════════════════════
  //  /start
  // ════════════════════════════════════════════════════════════
  bot.start(async (ctx) => {
    const userId   = ctx.from.id;
    const username = ctx.from.username || '';

    // Ensure online wallet exists (Mode B)
    await ensureOnlineWallet(userId, username).catch(() => {});

    // Check existing shop link
    const link = await getTelegramLink(userId);

    let greeting = `🎉 <b>እንኳን ወደ ATD Bingo በደህና መጡ!</b>\n\n`;
    if (link?.shop_id) {
      greeting +=
        `🏪 ቤት: <code>${link.shop_id}</code>\n` +
        `👤 Username: <code>${link.username}</code>\n\n`;
    }
    greeting += `ከዚህ በታች ካለው ምናሌ ምርጫዎን ያድርጉ 👇`;

    await ctx.replyWithHTML(greeting, mainMenu);
  });

  // ════════════════════════════════════════════════════════════
  //  CONTACT SHARE → Phone-based shop linking
  // ════════════════════════════════════════════════════════════
  bot.on('contact', async (ctx) => {
    const contact  = ctx.message.contact;
    const userId   = ctx.from.id;
    const tgUser   = ctx.from.username || '';

    // Normalize phone to 09XX format
    let phone = contact.phone_number.replace(/[^\d+]/g, '');
    if (phone.startsWith('+251')) phone = '0' + phone.slice(4);
    else if (phone.startsWith('251')) phone = '0' + phone.slice(3);

    const shop = await linkByPhone(phone, userId, tgUser);

    if (shop) {
      await ctx.replyWithHTML(
        `✅ <b>ቤቱ ተሳካ!</b>\n\n` +
        `🏪 Shop ID: <code>${shop.shop_id}</code>\n` +
        `👤 Username: <code>${shop.username}</code>\n\n` +
        `ቀጥለው 💰 ባላንስ መሙላት ይምረጡ።`,
        mainMenu,
      );
    } else {
      await ctx.replyWithHTML(
        `ℹ️ ስልክ ቁጥርዎ ተቀምጧል፤ ነገር ግን ከ ACTIVE Shop ጋር አልተገናኘም።\n\n` +
        `Shop ID ካለዎ <code>SHOP-XXXXXXX</code> አስገቡ፤ ወይም 📝 አዲስ ቤት መመዝገብ ይምረጡ።`,
        mainMenu,
      );
    }
  });

  // ════════════════════════════════════════════════════════════
  //  📝 አዲስ ቤት መመዝገብ  — 5-step registration wizard
  // ════════════════════════════════════════════════════════════
  bot.hears('📝 አዲስ ቤት መመዝገብ', async (ctx) => {
    regState.set(ctx.from.id, { step: 'reg_name' });
    await ctx.replyWithHTML(
      `📝 <b>አዲስ ቤት / ማዕከል ምዝገባ</b>\n\n` +
      `ደረጃ 1 / 5 — <b>የቤቱ / ማዕከሉ ስም</b> ያስገቡ፦`,
      cancelKeyboard,
    );
  });

  // ════════════════════════════════════════════════════════════
  //  TEXT: Handle registration wizard steps
  // ════════════════════════════════════════════════════════════
  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const state  = regState.get(userId);
    if (!state) return next();

    const text = ctx.message.text.trim();

    // Cancel
    if (text === '❌ ሰርዝ') {
      regState.delete(userId);
      return ctx.reply('❌ ምዝገባው ተሰርዟል።', mainMenu);
    }

    switch (state.step) {
      case 'reg_name':
        state.ownerName = text;
        state.step      = 'reg_username';
        regState.set(userId, state);
        return ctx.replyWithHTML(
          `ደረጃ 2 / 5 — <b>ATD Client Username</b> ያስገቡ\n(ለምሳሌ: <code>adis</code>)፦`
        );

      case 'reg_username':
        state.username = text.toLowerCase().replace(/\s+/g, '');
        state.step     = 'reg_phone';
        regState.set(userId, state);
        return ctx.replyWithHTML(`ደረጃ 3 / 5 — <b>ስልክ ቁጥር</b> ያስገቡ (09...)፦`);

      case 'reg_phone':
        state.phone = text;
        state.step  = 'reg_region';
        regState.set(userId, state);
        return ctx.replyWithHTML(`ደረጃ 4 / 5 — <b>ክልል / አድራሻ</b> ያስገቡ፦`);

      case 'reg_region':
        state.region = text;
        state.step   = 'reg_mac';
        regState.set(userId, state);
        return ctx.replyWithHTML(
          `ደረጃ 5 / 5 — <b>ኮምፒውተር MAC Address</b> ያስገቡ\n(ለምሳሌ: <code>AA:BB:CC:DD:EE:FF</code>)፦`
        );

      case 'reg_mac': {
        state.macAddress = text;
        regState.delete(userId);

        try {
          const shop = await registerShop(state);

          // Notify Admin
          await bot.telegram.sendMessage(
            env.ADMIN_TELEGRAM_ID,
            `🆕 <b>አዲስ ቤት ምዝገባ!</b>\n\n` +
            `🏪 Shop ID: <code>${shop.shop_id}</code>\n` +
            `👤 Username: <code>${shop.username}</code>\n` +
            `📛 ስም: ${shop.owner_name}\n` +
            `📱 ስልክ: ${shop.phone}\n` +
            `🌍 ክልል: ${shop.region}\n` +
            `💻 MAC: ${shop.mac_address}\n\n` +
            `ለማጽደቅ ወይም ለመሰረዝ ከዚህ ይምረጡ 👇`,
            { parse_mode: 'HTML', ...adminShopApprovalKeyboard(shop.shop_id) }
          );

          await ctx.replyWithHTML(
            `✅ <b>ምዝገባዎ ደረሰ!</b>\n\n` +
            `🏪 Shop ID: <code>${shop.shop_id}</code>\n\n` +
            `Admin ሲፈቅዱ ያሳውቅዎታል። ምስጋና!`,
            mainMenu,
          );
        } catch (err) {
          console.error('[REG]', err.message);
          await ctx.reply('❌ ምዝገባ ስህተት ደረሰ። እባክዎ እንደገና ይሞክሩ።', mainMenu);
        }
        return;
      }

      default:
        return next();
    }
  });

  // ════════════════════════════════════════════════════════════
  //  ADMIN: Approve / Reject shop registration
  // ════════════════════════════════════════════════════════════
  bot.action(/^admin:shop:approve:(.+)$/, async (ctx) => {
    if (String(ctx.from.id) !== String(env.ADMIN_TELEGRAM_ID)) {
      return ctx.answerCbQuery('❌ ፈቃድ የለዎትም');
    }
    const shopId = ctx.match[1];
    try {
      await activateShop(shopId);
      const originalText = ctx.callbackQuery.message?.text || '';
      await ctx.editMessageText(
        originalText + `\n\n✅ ቤቱ ተፈቅዷል (ACTIVE) — ${new Date().toLocaleString()}`,
        { parse_mode: 'HTML' }
      );
      await ctx.answerCbQuery('✅ Shop activated');
    } catch (err) {
      console.error('[ADMIN SHOP APPROVE]', err.message);
      await ctx.answerCbQuery('❌ Error: ' + err.message);
    }
  });

  bot.action(/^admin:shop:reject:(.+)$/, async (ctx) => {
    if (String(ctx.from.id) !== String(env.ADMIN_TELEGRAM_ID)) {
      return ctx.answerCbQuery('❌');
    }
    const originalText = ctx.callbackQuery.message?.text || '';
    await ctx.editMessageText(
      originalText + '\n\n❌ ቤቱ ውድቅ ተደርጓል።',
      { parse_mode: 'HTML' }
    );
    await ctx.answerCbQuery('❌ Rejected');
  });
};
