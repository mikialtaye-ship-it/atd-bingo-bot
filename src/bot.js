async function handlePaymentProof(ctx, session, supabase, ADMIN_ID) {
  const isPhoto = Boolean(ctx.message && ctx.message.photo);
  const isText = Boolean(ctx.message && ctx.message.text);

  if (isPhoto || isText) {
    const proofType = isPhoto ? 'photo' : 'text';
    const proofContent = isPhoto
      ? ctx.message.photo[ctx.message.photo.length - 1].file_id
      : ctx.message.text;

    const { data: tx, error } = await supabase
      .from('transactions')
      .insert({
        user_id: ctx.from.id,
        shop_id: session.shop_id,
        shop_username: session.shop_username,
        sync_amount: session.sync_amount,
        mode: 'offline_sync',
        proof_type: proofType,
        proof_data: proofContent,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      return ctx.reply('❌ ስህተት ተፈጥሯል፦ ' + error.message);
    }

    await ctx.reply('✅ የክፍያ ማረጋገጫዎ (ደረሰኝ/SMS) ለአድሚን ተልኳል። አድሚኑ እንዳጸደቀው ወዲያውኑ Sync ይደረግልዎታል።');

    let adminCaption = '🔔 አዲስ የ Sync ጥያቄ\n\n' +
      '🏪 Shop ID: ' + tx.shop_id + '\n' +
      '👤 Username: ' + tx.shop_username + '\n' +
      '💰 Sync የሚደረግ መጠን: ' + tx.sync_amount + ' ETB\n' +
      '📄 ማረጋገጫ አይነት: ' + (isPhoto ? 'Screenshot (ፎቶ)' : 'SMS Text (ጽሁፍ)') + '\n';

    if (isText) {
      adminCaption += '\n💬 የተላከው ቴክስት:\n' + proofContent + '\n';
    }

    const buttons = {
      inline_keyboard: [
        [
          { text: '✅ Approve (' + tx.sync_amount + ' ETB)', callback_data: 'approve_tx_' + tx.id },
          { text: '❌ Reject', callback_data: 'reject_tx_' + tx.id }
        ]
      ]
    };

    if (isPhoto) {
      await ctx.telegram.sendPhoto(ADMIN_ID, proofContent, {
        caption: adminCaption,
        reply_markup: buttons
      });
    } else {
      await ctx.telegram.sendMessage(ADMIN_ID, adminCaption, {
        reply_markup: buttons
      });
    }
  }
}
