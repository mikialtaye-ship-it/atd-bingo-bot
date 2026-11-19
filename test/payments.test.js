import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePaymentMessage } from '../src/payments.js';

test('parses a standard Telebirr confirmation', () => {
  assert.deepEqual(parsePaymentMessage('Transaction ID: AbC123456\nYou paid ETB 1,250.50'), {
    transactionId: 'ABC123456',
    amount: '1250.50',
  });
});

test('parses amount before ETB and a reference number', () => {
  assert.deepEqual(parsePaymentMessage('Reference Number: XZ-12345. Amount: 75 ETB'), {
    transactionId: 'XZ-12345',
    amount: '75.00',
  });
});

test('rejects missing references, amounts, and unreasonable amounts', () => {
  assert.equal(parsePaymentMessage('Transaction ID: ABC123456'), null);
  assert.equal(parsePaymentMessage('ETB 15.00'), null);
  assert.equal(parsePaymentMessage('Ref No: ABC123456 ETB 1000001'), null);
});