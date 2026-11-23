// ተጠቃሚው ደረጃ 4 ላይ ሲሆን (ደረሰኝ ወይም የቴሌብር/ባንክ SMS ሲጠበቅ)
const isPhoto = Boolean(ctx.message?.photo);
const isText = Boolean(ctx.message?.text);

if (isPhoto || isText) {
  const proofType = isPhoto ? 'photo' : 'text';
  const proofContent = isPhoto 
    ? ctx.message.photo[ctx.message.photo.length - 1].file_id 
    : ctx.message.text;

  // 1. ዳታቤዝ (transactions) ላይ status: 'pending' ብሎ መመዝገብ
  // (ከዚህ በፊት የነበረውን አውቶማቲክ የቴሌብር SMS ማረጋገጫ ቼክ አንስተህ ሁሉም ወደ Admin እንዲሄድ ማድረግ)
  const { data: tx, error } = await supabase
    .from('transactions')
    .insert({
      user_id: ctx.from.id,
      shop_id: session.shop_id,
      shop_username: session.shop_username,
      sync_amount: session.sync_amount, // Sync የሚደረገው መጠን (ለምሳሌ 20000)
      mode: 'offline_sync',
      proof_type: proofType,
      proof_data: proofContent,
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    return ctx.reply(❌ ስህተት ተፈጥሯል፦ ${error.message});
  }

  // 2. ለተጠቃሚው መልስ መስጠት
  await ctx.reply('✅ የክፍያ ማረጋገጫዎ (ደረሰኝ/SMS) ለአድሚን ተልኳል። አድሚኑ እንዳጸደቀው ወዲያውኑ Sync ይደረግልዎታል።');

  // 3. ወደ አድሚን (ወደ አንተ) መላክ
  const adminCaption = 🔔 **አዲስ የ Sync ጥያቄ**\n\n +
    🏪 **Shop ID:** \${tx.shop_id}\\n +
    👤 **Username:** \${tx.shop_username}\\n +
    💰 **Sync የሚደረግ መጠን:** **${tx.sync_amount} ETB**\n +
    📄 **ማረጋገጫ አይነት:** ${isPhoto ? 'Screenshot (ፎቶ)' : 'SMS Text (ጽሁፍ)'}\n +
    (isText ? \n💬 **የተላከው ቴክስት:**\n\${proofContent}\\n : '');

  const buttons = {
    inline_keyboard: [
      [
        { text: ✅ Approve (${tx.sync_amount} ETB), callback_data: approve_tx_${tx.id} },
        { text: '❌ Reject', callback_data: reject_tx_${tx.id} }
      ]
    ]
  };

  if (isPhoto) {
    await ctx.telegram.sendPhoto(ADMIN_ID, proofContent, {
      caption: adminCaption,
      parse_mode: 'Markdown',
      reply_markup: buttons
    });
  } else {
    await ctx.telegram.sendMessage(ADMIN_ID, adminCaption, {
      parse_mode: 'Markdown',
      reply_markup: buttons
    });
  }
}
