const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePaymentSms } = require('../src/payments');

test('Parses Telebirr Amharic/English SMS correctly', () => {
  const sms =
    'የግብይት ቁጥር BHG49X21KL ነው። ወደ 0962025699 ETB 20000.00 በተሳካ ሁኔታ ልከዋል።';
  const result = parsePaymentSms(sms);

  assert.equal(result.isValid, true);
  assert.equal(result.bank, 'TELEBIRR');
  assert.equal(result.transactionId, 'BHG49X21KL');
  assert.equal(result.amount, 20000);
});

test('Parses Commercial Bank of Ethiopia (CBE) SMS correctly', () => {
  const sms =
    'Dear Customer, your account 1000****1234 has been debited with ETB 5,500.00. Ref No FT26324A9B1C.';
  const result = parsePaymentSms(sms);

  assert.equal(result.isValid, true);
  assert.equal(result.bank, 'CBE');
  assert.equal(result.transactionId, 'FT26324A9B1C');
  assert.equal(result.amount, 5500);
});

test('Rejects invalid or incomplete SMS messages', () => {
  const result = parsePaymentSms('ሰላም እንዴት ዋሉ?');
  assert.equal(result.isValid, false);
});
