import { Markup, Telegraf, session } from 'telegraf';
import { config } from './config.js';
import { parsePaymentMessage } from './payments.js';
import { isMissingColumn, supabase } from './supabase.js';

export const bot = new Telegraf(config.botToken);
bot.use(session());

const menu = Markup.keyboard([
  ['💰 ባላንስ መሙላት (Deposit)'],
  ['💳 የእኔ ባላንስ (My Balance)', '📜 የግብይት ታሪክ (History)'],
  ['📞 እርዳታ (Support)'],
]).resize().persistent();

const paymentChoices = Markup.inlineKeyboard([
  [Markup.button.callback('ቴሌብር', 'pay:telebirr')],
  [Markup.button.callback('ንግድ ባንክ (CBE)', 'pay:cbe')],
  [Markup.button.callback('አቢሲኒያ ባንክ', 'pay:abyssinia')],
]);

const paymentLabels = {
  telebirr: 'ቴሌብር',
  cbe: 'ንግድ ባንክ (CBE)',
  abyssinia: 'አቢሲኒያ ባንክ',
};

function mainMenuMessage() {
  return `እንኳን ወደ ATD Bingo በደህና መጡ!\n\nከታች ያለውን አገልግሎት ይምረጡ።`;
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ብር`;
}

async function getLink(telegramId) {
  const { data, error } = await supabase
    .from('telegram_links')
    .select('user_id')
    .eq('telegram_id', String(telegramId))
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getAccount(userId) {
  const { data, error } = await supabase.from('users').select('id,balance').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function linkByIdentifier(value) {
  const identifier = value.trim();
  if (!identifier || identifier.length > 100) return null;
  for (const column of config.identifierColumns) {
    const { data, error } = await supabase.from('users').select('id').eq(column, identifier).maybeSingle();
    if (!error && data) return data;
    if (error && !isMissingColumn(error)) throw error;
  }
  return null;
}

async function saveLink(telegramId, userId) {
  const { error } = await supabase.from('telegram_links').upsert({
    telegram_id: String(telegramId),
    user_id: userId,
  }, { onConflict: 'telegram_id' });
  if (error) throw error;
}

async function requireLink(ctx) {
  const link = await getLink(ctx.from.id);
  if (link) return link;
  ctx.session.awaitingLink = true;
  await ctx.reply(
    'የATD Bingo መለያዎን ለማገናኘት በመለያዎ የተመዘገበውን ስልክ ቁጥር ወይም የተጠቃሚ ስም ይጻፉ። ወይም የተመዘገበውን ስልክ ቁጥር በእውቂያ አዝራሩ ያጋሩ።',
    Markup.keyboard([[Markup.button.contactRequest('📱 ስልኬን አጋራ')], ['/cancel']]).resize(),
  );
  return null;
}

async function submitDeposit(ctx, method, content, photoFileId = null) {
  const parsed = parsePaymentMessage(content);
  if (!parsed) {
    ctx.session.awaitingReceipt = method;
    if (photoFileId) {
      await bot.telegram.sendPhoto(config.adminTelegramId, photoFileId, {
        caption: `የደረሰኝ ፎቶ (የግብይት መረጃ በካፕሽኑ አልተገኘም)\nTelegram ID: ${ctx.from.id}\nTelegram: ${ctx.from.username || ctx.from.first_name || 'ያልታወቀ'}\nየክፍያ ዘዴ: ${paymentLabels[method]}`,
      });
    }
    await ctx.reply(
      photoFileId
        ? 'የደረሰኝ ፎቶዎ ለአስተዳዳሪው ተልኳል። ለማጽደቅ ግን Transaction ID/Reference Number እና የETB መጠኑን አሁን በጽሑፍ ይላኩ።'
        : 'የክፍያ መረጃውን ማንበብ አልተቻለም። እባክዎ Transaction ID/Reference Number እና የETB መጠኑን ያካተተውን SMS ወይም የደረሰኝ ፎቶ ካፕሽን ይላኩ።',
      menu,
    );
    return;
  }

  const link = await getLink(ctx.from.id);
  if (!link) {
    ctx.session.awaitingPaymentMethod = null;
    await requireLink(ctx);
    return;
  }

  const account = await getAccount(link.user_id);
  if (!account) throw new Error('Linked user account no longer exists');
  const { data: transaction, error } = await supabase.from('transactions').insert({
    user_id: account.id,
    telegram_id: String(ctx.from.id),
    username: ctx.from.username || ctx.from.first_name || 'Telegram user',
    amount: parsed.amount,
    payment_method: method,
    transaction_id: parsed.transactionId,
    status: 'pending',
  }).select('id').single();

  if (error?.code === '23505') {
    await ctx.reply('❌ ይህ Transaction ID ከዚህ በፊት ተመዝግቧል። እባክዎ የተለየ የክፍያ ማረጋገጫ ይጠቀሙ።', menu);
    return;
  }
  if (error) throw error;

  const adminText = [
    '🆕 አዲስ የባላንስ መሙያ ጥያቄ',
    `መጠን: ${formatMoney(parsed.amount)}`,
    `መንገድ: ${paymentLabels[method]}`,
    `Transaction ID: ${parsed.transactionId}`,
    `የATD Bingo User ID: ${account.id}`,
    `Telegram ID: ${ctx.from.id}`,
    `Telegram: ${ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'ያልታወቀ')}`,
  ].join('\n');
  const actions = Markup.inlineKeyboard([[
    Markup.button.callback('✅ አጽድቅ (Approve)', `dep:a:${transaction.id}`),
    Markup.button.callback('❌ ውድቅ አድርግ (Reject)', `dep:r:${transaction.id}`),
  ]]);

  if (photoFileId) {
    await bot.telegram.sendPhoto(config.adminTelegramId, photoFileId, { caption: adminText, ...actions });
  } else {
    await bot.telegram.sendMessage(config.adminTelegramId, adminText, actions);
  }
  await ctx.reply('✅ የመሙያ ጥያቄዎ ተቀብሏል። ክፍያው ከተረጋገጠ በኋላ ባላንስዎ ይጨመራል።', menu);
}

bot.command('start', async (ctx) => {
  ctx.session = {};
  const link = await getLink(ctx.from.id);
  if (!link) {
    ctx.session.awaitingLink = true;
    await ctx.reply(
      `${mainMenuMessage()}\n\nመጀመሪያ የATD Bingo መለያዎን ያገናኙ። የተመዘገበውን ስልክ ቁጥር ወይም የተጠቃሚ ስም ይጻፉ፣ ወይም የተመዘገበውን ስልክ በእውቂያ አዝራሩ ያጋሩ።`,
      Markup.keyboard([[Markup.button.contactRequest('📱 ስልኬን አጋራ')], ['/cancel']]).resize(),
    );
    return;
  }
  await ctx.reply(mainMenuMessage(), menu);
});

bot.command('cancel', async (ctx) => {
  ctx.session = {};
  await ctx.reply('የአሁኑ ሂደት ተሰርዟል።', menu);
});

bot.command('pending', async (ctx) => {
  if (String(ctx.from.id) !== config.adminTelegramId) return ctx.reply('ይህ ትዕዛዝ ለአስተዳዳሪው ብቻ ነው።');
  const { data, error } = await supabase.from('transactions')
    .select('id,amount,payment_method,transaction_id,telegram_id,username,created_at')
    .eq('status', 'pending').order('created_at', { ascending: true }).limit(20);
  if (error) throw error;
  if (!data.length) return ctx.reply('በመጠባበቅ ላይ ያሉ ጥያቄዎች የሉም።');
  for (const item of data) {
    await ctx.reply([
      `ጥያቄ: ${item.id}`,
      `መጠን: ${formatMoney(item.amount)}`,
      `ዘዴ: ${paymentLabels[item.payment_method] || item.payment_method}`,
      `Transaction ID: ${item.transaction_id}`,
      `ተጠቃሚ: ${item.username} (${item.telegram_id})`,
    ].join('\n'), Markup.inlineKeyboard([[
      Markup.button.callback('✅ አጽድቅ', `dep:a:${item.id}`),
      Markup.button.callback('❌ ውድቅ', `dep:r:${item.id}`),
    ]]));
  }
});

bot.command('setref', async (ctx) => {
  if (String(ctx.from.id) !== config.adminTelegramId) return ctx.reply('ይህ ትዕዛዝ ለአስተዳዳሪው ብቻ ነው።');
  const [, id, reference] = ctx.message.text.split(/\s+/);
  if (!id || !reference || !/^[A-Za-z0-9][A-Za-z0-9-]{4,}$/.test(reference)) {
    return ctx.reply('አጠቃቀም: /setref <ጥያቄ-ID> <Transaction-ID>');
  }
  const { error } = await supabase.from('transactions').update({ transaction_id: reference.toUpperCase() })
    .eq('id', id).eq('status', 'pending');
  if (error?.code === '23505') return ctx.reply('ይህ Transaction ID ከዚህ በፊት ተጠቅሟል።');
  if (error) throw error;
  await ctx.reply('Transaction ID ተመዝግቧል። አሁን ጥያቄውን ማጽደቅ ይችላሉ።');
});

bot.action(/^pay:(telebirr|cbe|abyssinia)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const linked = await requireLink(ctx);
  if (!linked) return;
  const method = ctx.match[1];
  ctx.session.awaitingPaymentMethod = null;
  ctx.session.awaitingReceipt = method;
  const details = {
    telebirr: `ቴሌብር: ${config.telebirrNumber}`,
    cbe: `CBE ሂሳብ: ${config.cbeAccount}`,
    abyssinia: `አቢሲኒያ ባንክ ሂሳብ: ${config.abyssiniaAccount}`,
  };
  await ctx.reply(
    `${details[method]}\n\nከላይ ያለውን መረጃ ተጠቅመው ክፍያ ይፈጽሙ። ከዚያ የማረጋገጫ SMS ጽሑፉን ወይም የደረሰኝ ፎቶውን ከTransaction ID/Reference Number እና ከETB መጠኑ ጋር በአንድ መልዕክት ይላኩ።`,
    menu,
  );
});

bot.action(/^dep:([ar]):([0-9a-f-]{36})$/i, async (ctx) => {
  if (String(ctx.from.id) !== config.adminTelegramId) {
    await ctx.answerCbQuery('ይህ እርምጃ ለአስተዳዳሪው ብቻ ነው።', { show_alert: true });
    return;
  }
  const [, action, id] = ctx.match;
  const { data: transaction, error: findError } = await supabase.from('transactions')
    .select('id,user_id,telegram_id,amount,transaction_id,status')
    .eq('id', id).maybeSingle();
  if (findError) throw findError;
  if (!transaction || transaction.status !== 'pending') {
    await ctx.answerCbQuery('ይህ ጥያቄ ቀድሞ ተሰርቷል ወይም አልተገኘም።', { show_alert: true });
    return;
  }

  if (action === 'r') {
    const { data: rejected, error } = await supabase.from('transactions').update({ status: 'rejected' })
      .eq('id', id).eq('status', 'pending').select('id').maybeSingle();
    if (error) throw error;
    if (!rejected) {
      await ctx.answerCbQuery('ይህ ጥያቄ ቀድሞ ተሰርቷል።', { show_alert: true });
      return;
    }
    await bot.telegram.sendMessage(transaction.telegram_id, '❌ የክፍያ ጥያቄዎ አልጸደቀም። እባክዎ ከእርዳታ አገልግሎት ጋር ይገናኙ።');
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.answerCbQuery('ጥያቄው ውድቅ ሆኗል።');
    return;
  }

  const { data: newBalance, error } = await supabase.rpc('approve_deposit_and_sync_balance', {
    p_transaction_id: transaction.transaction_id,
  });
  if (error) {
    await ctx.answerCbQuery('ማጽደቅ አልተሳካም፤ ጥያቄው በመጠባበቅ ላይ ይቆያል።', { show_alert: true });
    throw error;
  }
  await bot.telegram.sendMessage(
    transaction.telegram_id,
    `✅ ክፍያዎ ተረጋግጧል! ${formatMoney(transaction.amount)} ወደ ATD Bingo አካውንትዎ ገብቷል።\nአዲሱ ባላንስዎ፡ ${formatMoney(newBalance)}`,
  );
  await ctx.editMessageReplyMarkup(undefined);
  await ctx.answerCbQuery('ክፍያው ጸድቋል።');
});

bot.on('contact', async (ctx) => {
  if (ctx.message.contact.user_id !== ctx.from.id) {
    return ctx.reply('እባክዎ የራስዎን ስልክ ቁጥር በእውቂያ አዝራሩ ያጋሩ።');
  }
  const link = await linkByIdentifier(ctx.message.contact.phone_number);
  if (!link) return ctx.reply('ይህ ስልክ ቁጥር በATD Bingo መለያ ላይ አልተመዘገበም። እባክዎ የተመዘገበውን ቁጥር ይጠቀሙ።');
  await saveLink(ctx.from.id, link.id);
  ctx.session = {};
  await ctx.reply(mainMenuMessage(), menu);
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;
  if (text === '💰 ባላንስ መሙላት (Deposit)') {
    if (!await requireLink(ctx)) return;
    ctx.session.awaitingPaymentMethod = true;
    await ctx.reply('የክፍያ ዘዴ ይምረጡ።', paymentChoices);
    return;
  }
  if (text === '💳 የእኔ ባላንስ (My Balance)') {
    const link = await requireLink(ctx);
    if (!link) return;
    const account = await getAccount(link.user_id);
    return ctx.reply(account ? `💳 የአሁኑ ባላንስዎ፡ ${formatMoney(account.balance)}` : 'መለያው አልተገኘም።', menu);
  }
  if (text === '📜 የግብይት ታሪክ (History)') {
    const link = await requireLink(ctx);
    if (!link) return;
    const { data, error } = await supabase.from('transactions')
      .select('amount,payment_method,transaction_id,status,created_at')
      .eq('user_id', link.user_id).order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    if (!data.length) return ctx.reply('የግብይት ታሪክ የለም።', menu);
    const statuses = { pending: 'በመጠባበቅ ላይ', approved: 'ጸድቋል', rejected: 'ውድቅ ሆኗል' };
    return ctx.reply(data.map((item) =>
      `${new Date(item.created_at).toLocaleDateString('am-ET')} · ${formatMoney(item.amount)} · ${paymentLabels[item.payment_method]} · ${statuses[item.status]}\nID: ${item.transaction_id}`,
    ).join('\n\n'), menu);
  }
  if (text === '📞 እርዳታ (Support)') {
    ctx.session.awaitingSupport = true;
    return ctx.reply('እባክዎ የእርዳታ ጥያቄዎን አሁን ይጻፉ። /cancel በመጠቀም መሰረዝ ይችላሉ።');
  }
  if (ctx.session.awaitingLink) {
    const account = await linkByIdentifier(text);
    if (!account) return ctx.reply('ይህ መረጃ ከATD Bingo መለያ ጋር አልተገናኘም። እንደገና ይሞክሩ ወይም የተመዘገበውን ስልክ በእውቂያ ያጋሩ።');
    await saveLink(ctx.from.id, account.id);
    ctx.session = {};
    return ctx.reply(mainMenuMessage(), menu);
  }
  if (ctx.session.awaitingSupport) {
    ctx.session.awaitingSupport = false;
    await bot.telegram.sendMessage(config.supportTelegramId, `የእርዳታ ጥያቄ\nTelegram ID: ${ctx.from.id}\nTelegram: ${ctx.from.username || ctx.from.first_name}\n\n${text}`);
    return ctx.reply('የእርዳታ ጥያቄዎ ተልኳል።', menu);
  }
  if (ctx.session.awaitingReceipt) {
    const method = ctx.session.awaitingReceipt;
    ctx.session.awaitingReceipt = null;
    return submitDeposit(ctx, method, text);
  }
  if (!await requireLink(ctx)) return;
  await ctx.reply('እባክዎ ከምናሌው አንዱን ይምረጡ።', menu);
});

bot.on('photo', async (ctx) => {
  if (!await requireLink(ctx)) return;
  if (!ctx.session.awaitingReceipt) {
    return ctx.reply('መጀመሪያ ከምናሌው የባላንስ መሙያ ዘዴ ይምረጡ።', menu);
  }
  const method = ctx.session.awaitingReceipt;
  ctx.session.awaitingReceipt = null;
  const caption = ctx.message.caption || '';
  return submitDeposit(ctx, method, caption, ctx.message.photo.at(-1).file_id);
});

bot.catch((error, ctx) => {
  console.error('Bot update failed:', error);
  if (ctx?.chat?.id) void ctx.reply('ችግር ተፈጥሯል። እባክዎ ቆይተው እንደገና ይሞክሩ ወይም እርዳታን ያግኙ።').catch(() => {});
});