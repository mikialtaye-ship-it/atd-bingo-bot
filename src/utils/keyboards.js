'use strict';
const { Markup } = require('telegraf');

// ════════════════════════════════════════════════════════════════
//  PERSISTENT MAIN MENU (reply keyboard — always visible)
// ════════════════════════════════════════════════════════════════
const mainMenu = Markup.keyboard([
  ['🎮 ኦንላይን ጨዋታዎች (Bingo / Keno / Aviator)'],
  ['💰 ባላንስ መሙላት', '💳 የእኔ ባላንስ'],
  ['📲 ኦፍላይን አፕ አውርድ', '📝 አዲስ ቤት መመዝገብ'],
  ['📜 የግብይት ታሪክ', '📞 እርዳታ'],
]).resize();

// ════════════════════════════════════════════════════════════════
//  DEPOSIT FLOW
// ════════════════════════════════════════════════════════════════

/** Step 0 — choose deposit mode */
const depositModeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🏪 ለኦፍላይን ቤት (Offline Shop Sync)',   'deposit:offline')],
  [Markup.button.callback('🎮 ለኦንላይን ጨዋታ (Online Game Wallet)', 'deposit:online')],
]);

/** Step 1 (offline) — confirm existing linked shop or enter a new one */
function confirmShopKeyboard(shopId, username) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`✅ ${shopId} (${username}) — ቀጥል`, 'deposit:use_saved')],
    [Markup.button.callback('🔄 ሌላ Shop ID አስገባ', 'deposit:change_shop')],
  ]);
}

/** Admin deposit approval */
function adminApprovalKeyboard(txId, type) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ አጽድቅና Sync አድርግ', `admin:approve:${type}:${txId}`)],
    [Markup.button.callback('❌ ውድቅ አድርግ', `admin:reject:${txId}`)],
  ]);
}

// ════════════════════════════════════════════════════════════════
//  SHOP REGISTRATION
// ════════════════════════════════════════════════════════════════

/** Admin new-shop approval */
function adminShopApprovalKeyboard(shopId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ ቤቱን አጽድቅ (Activate)', `admin:shop:approve:${shopId}`)],
    [Markup.button.callback('❌ ውድቅ አድርግ',            `admin:shop:reject:${shopId}`)],
  ]);
}

// ════════════════════════════════════════════════════════════════
//  ONLINE GAMES HUB
// ════════════════════════════════════════════════════════════════

/**
 * Build the online games inline keyboard.
 * Uses webApp buttons when URLs are configured; callback "coming soon" otherwise.
 */
function onlineGamesKeyboard(bingoUrl, kenoUrl, aviatorUrl, userId) {
  const rows = [];

  if (bingoUrl) {
    rows.push([Markup.button.webApp('🎱 ኦንላይን ቢንጎ (Online Bingo)', `${bingoUrl}?tg_id=${userId}`)]);
  } else {
    rows.push([Markup.button.callback('🎱 ኦንላይን ቢንጎ — 🚧 በቅርብ ቀን', 'game:coming_bingo')]);
  }

  if (kenoUrl) {
    rows.push([Markup.button.webApp('🔢 ኬኖ (Online Keno)', `${kenoUrl}?tg_id=${userId}`)]);
  } else {
    rows.push([Markup.button.callback('🔢 ኬኖ — 🚧 በቅርብ ቀን', 'game:coming_keno')]);
  }

  if (aviatorUrl) {
    rows.push([Markup.button.webApp('✈️ አቪዬተር (Aviator)', `${aviatorUrl}?tg_id=${userId}`)]);
  } else {
    rows.push([Markup.button.callback('✈️ አቪዬተር — 🚧 በቅርብ ቀን', 'game:coming_aviator')]);
  }

  rows.push([Markup.button.callback('💰 ለኦንላይን ባላንስ ሙላ', 'deposit:online_quick')]);
  return Markup.inlineKeyboard(rows);
}

// ════════════════════════════════════════════════════════════════
//  UTILITY KEYBOARDS
// ════════════════════════════════════════════════════════════════

/** Request phone number contact (used in /start linking) */
const shareContactKeyboard = Markup.keyboard([
  [Markup.button.contactRequest('📱 ስልክ ቁጥሬን አጋራ')],
  ['↩️ ሳትጋራ ቀጥል'],
]).resize();

/** Cancel any multi-step flow */
const cancelKeyboard = Markup.keyboard([['❌ ሰርዝ']]).resize();

/** Support / FAQ inline keyboard */
const supportKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('💳 ባላንስ Sync አልሆነልኝም?',          'faq:sync')],
  [Markup.button.callback('📲 ኦፍላይን አፕ አልከፈተልኝም?',         'faq:app')],
  [Markup.button.callback('🔗 Shop ID እና Username እንዴት?',    'faq:shoplink')],
  [Markup.button.callback('🎮 ኦንላይን ጌም እንዴት ልጫወት?',        'faq:online')],
]);

module.exports = {
  mainMenu,
  depositModeKeyboard,
  confirmShopKeyboard,
  adminApprovalKeyboard,
  adminShopApprovalKeyboard,
  onlineGamesKeyboard,
  shareContactKeyboard,
  cancelKeyboard,
  supportKeyboard,
};
