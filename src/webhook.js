import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { config } from './config.js';
import { bot } from './bot.js';
import { parsePaymentMessage, parseSmsPayload } from './payments.js';
import { supabase } from './supabase.js';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(express.text({ limit: '16kb', type: ['text/plain', 'application/sms'] }));

app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

function validToken(received) {
  const expected = Buffer.from(config.smsForwarderToken);
  const supplied = Buffer.from(received || '');
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

app.post('/webhook/sms-forwarder', async (req, res) => {
  if (config.verificationMode !== 'auto' || !config.smsForwarderToken) {
    return res.status(404).json({ error: 'not_found' });
  }
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : req.get('x-forwarder-token');
  if (!validToken(token)) return res.status(401).json({ error: 'unauthorized' });

  const parsed = parsePaymentMessage(parseSmsPayload(req.body));
  if (!parsed) return res.status(400).json({ error: 'sms_not_recognized' });

  const { data: transaction, error } = await supabase.from('transactions')
    .select('id,user_id,telegram_id,amount,status,transaction_id')
    .eq('transaction_id', parsed.transactionId).eq('status', 'pending').maybeSingle();
  if (error) {
    console.error('SMS lookup failed:', error);
    return res.status(500).json({ error: 'lookup_failed' });
  }
  if (!transaction) return res.status(404).json({ error: 'pending_transaction_not_found' });
  if (Number(transaction.amount).toFixed(2) !== parsed.amount) {
    return res.status(409).json({ error: 'amount_mismatch' });
  }

  const { data: newBalance, error: approvalError } = await supabase.rpc('approve_deposit_and_sync_balance', {
    p_transaction_id: transaction.transaction_id,
  });
  if (approvalError) {
    console.error('SMS approval failed:', approvalError);
    return res.status(409).json({ error: 'approval_failed' });
  }

  await bot.telegram.sendMessage(
    transaction.telegram_id,
    `✅ ክፍያዎ ተረጋግጧል! ${Number(transaction.amount).toFixed(2)} ብር ወደ ATD Bingo አካውንትዎ ገብቷል።\nአዲሱ ባላንስዎ፡ ${Number(newBalance).toFixed(2)} ብር`,
  ).catch((sendError) => console.error('Could not send deposit notification:', sendError));
  return res.status(200).json({ status: 'approved' });
});