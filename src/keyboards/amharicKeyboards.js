const { Markup } = require('telegraf');
const config = require('../config');

const amharicKeyboards = {
  /**
   * Persistent Reply Keyboard Menu
   */
  mainMenu: () => {
    return Markup.keyboard([
      ['💰 ባላንስ መሙላት', '💳 የእኔ ባላንስ'],
      ['📲 ኦፍላይን አፕ አውርድ'],
      ['📜 የግብይት ታሪክ', '📞 እርዳታ'],
    ]).resize().persistent();
  },

  /**
   * Phone Contact Sharing Keyboard (for fast 1-click registration/linking)
   */
  requestContact: () => {
    return Markup.keyboard([
      [Markup.button.contactRequest('📱 ስልክ ቁጥር ላክ')],
      ['❌ ተመለስ'],
    ]).resize().oneTime();
  },

  /**
   * Payment Method Selection (Inline Keyboard)
   */
  paymentMethods: () => {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('📱 ቴሌብር (Telebirr)', 'pay_telebirr'),
        Markup.button.callback('🏦 ንግድ ባንክ (CBE)', 'pay_cbe'),
      ],
      [
        Markup.button.callback('🏛️ አቢሲኒያ ባንክ (BOA)', 'pay_boa'),
      ],
      [
        Markup.button.callback('🔙 ወደ ዋና ሜኑ ተመለስ', 'menu_main'),
      ],
    ]);
  },

  /**
   * Inline buttons displayed after bank instructions
   */
  paymentInstructionsMenu: () => {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('🔄 ሌላ የክፍያ አማራጭ ምረጥ', 'deposit_select_method'),
        Markup.button.callback('❌ ሰርዝ', 'menu_main'),
      ],
    ]);
  },

  /**
   * Admin Approval / Rejection buttons sent for incoming deposit
   */
  adminApproval: (transactionId) => {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ አጽድቅ (Approve)', `approve_${transactionId}`),
        Markup.button.callback('❌ ውድቅ አድርግ (Reject)', `reject_${transactionId}`),
      ],
    ]);
  },

  /**
   * Offline App Download Action Buttons
   */
  offlineAppButtons: (directDownloadUrl) => {
    const buttons = [];
    if (directDownloadUrl) {
      buttons.push([Markup.button.url('📥 ቀጥታ አውርድ (Direct Link)', directDownloadUrl)]);
    }
    buttons.push([
      Markup.button.callback('❓ የአጫጫን መመሪያ (Guide)', 'faq_app_help'),
      Markup.button.callback('📞 ድጋፍ ጠይቅ', 'menu_support'),
    ]);
    return Markup.inlineKeyboard(buttons);
  },

  /**
   * Customer Support & FAQ Menu
   */
  supportMenu: () => {
    const adminUrl = `https://t.me/${config.supportTelegramUsername}`;
    return Markup.inlineKeyboard([
      [Markup.button.url('💬 አድሚን አናግር (Direct Chat)', adminUrl)],
      [
        Markup.button.callback('💳 ክፍያ ዘገየብኝ?', 'faq_payment_delay'),
        Markup.button.callback('📲 ኦፍላይን አፕ አልከፈተልኝም?', 'faq_app_help'),
      ],
      [
        Markup.button.callback('🔗 አካውንት እንዴት ላገናኝ?', 'faq_account_link'),
      ],
      [Markup.button.callback('🔙 ወደ ዋና ሜኑ ተመለስ', 'menu_main')],
    ]);
  },

  /**
   * Simple back button to main menu
   */
  backToMainMenu: () => {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔙 ወደ ዋና ሜኑ ተመለስ', 'menu_main')],
    ]);
  },
};

module.exports = amharicKeyboards;
