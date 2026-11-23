const ADMIN_ID = process.env.ADMIN_CHAT_ID || '658002856';

// 1. ተጠቃሚው ስክሪንሾት (Photo) ሲልክ ወደ አድሚን መላክ
bot.on('photo', async (ctx) => {
  // እዚህ ጋር የተጠቃሚውን ሴሽን (shop_id, shop_username, sync_amount) ታገኛለህ
  const photoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  
  // ዳታቤዝ (transactions) ላይ status: 'pending' ብለህ ሴቭ ታደርጋለህ
  const { data: tx, error } = await supabase
    .from('transactions')
    .insert({
      user_id: ctx.from.id,
      shop_id: userSession.shop_id,
      shop_username: userSession.shop_username,
      sync_amount: userSession.sync_amount,
      mode: 'offline_sync',
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    return ctx.reply(`❌ ስህተት ተፈጥሯል፦ ${error.message}`);
  }

  // ለተጠቃሚው ማሳወቅ
  await ctx.reply('⏳ ደረሰኝዎ ለአድሚን ተልኳል። አድሚኑ እንዳረጋገጠ ሲንክ ይደረግልዎታል።');

  // ለአድሚን (ወደ አንተ) ስክሪንሾቱን ከ Approve/Reject ቁልፍ ጋር መላክ
  await ctx.telegram.sendPhoto(ADMIN_ID, photoFileId, {
    caption: `🔔 **አዲስ የ Sync ጥያቄ**\n\n` +
             `🏪 **Shop ID:** ${tx.shop_id}\n` +
             `👤 **Username:** ${tx.shop_username}\n` +
             `💰 **Sync የሚደረግ መጠን:** ${tx.sync_amount} ETB\n` +
             `🆔 **Transaction ID:** ${tx.id}`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: `✅ Approve (${tx.sync_amount} ETB)`, callback_data: `approve_tx_${tx.id}` },
          { text: '❌ Reject', callback_data: `reject_tx_${tx.id}` }
        ]
      ]
    }
  });
});

// 2. አድሚኑ Approve ወይም Reject ሲጫን የሚሰራ
bot.action(/^(approve|reject)_tx_(.+)$/, async (ctx) => {
  const action = ctx.match[1]; // 'approve' ወይም 'reject'
  const txId = ctx.match[2];

  // ዳታቤዙን ማዘመን (Update)
  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const { data: tx, error } = await supabase
    .from('transactions')
    .update({ status: newStatus })
    .eq('id', txId)
    .select()
    .single();

  if (error || !tx) {
    return ctx.answerCbQuery('❌ ስህተት ተፈጥሯል!');
  }

  if (action === 'approve') {
    // እዚህ ጋር የ Shop ባላንስ (Sync) የምትጨምርበትን ኮድ ታስገባለህ
    
    await ctx.editMessageCaption(
      `✅ **ጸድቋል (APPROVED)**\nShop: ${tx.shop_id} (${tx.shop_username})\nመጠን: ${tx.sync_amount} ETB`
    );
    // ለተጠቃሚው ማሳወቅ
    await ctx.telegram.sendMessage(
      tx.user_id, 
      `🎉 እንኳን ደስ አለዎት! ክፍያዎ ጸድቆ **${tx.sync_amount} ETB** ወደ ቤትዎ (${tx.shop_id}) Sync ተደርጓል።`
    );
  } else {
    await ctx.editMessageCaption(`❌ **ውድቅ ተደርጓል (REJECTED)**\nShop: ${tx.shop_id}`);
    await ctx.telegram.sendMessage(
      tx.user_id, 
      `❌ ይቅርታ፣ የላኩት የክፍያ ደረሰኝ ተቀባይነት አላገኘም። እባክዎ አድሚኑን ያናግሩ።`
    );
  }

  await ctx.answerCbQuery();
});
