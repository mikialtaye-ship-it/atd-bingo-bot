const smsParser = require('../src/services/smsParser');

const testCases = [
  {
    name: 'Telebirr English Standard Transfer',
    sms: 'You have transferred ETB 150.00 to 0969920066, fee ETB 0.00. Transaction ID: 10B9K38L21. Your current balance is ETB 405.00.',
    expected: {
      success: true,
      provider: 'TELEBIRR',
      transactionId: '10B9K38L21',
      amount: 150.0,
    },
  },
  {
    name: 'Telebirr Amharic Transfer',
    sms: 'ለ 0969920066 የብር 250.00 ዝውውር በተሳካ ሁኔታ አጠናቀዋል። የአገልግሎት ክፍያ ብር 0.00። የግብይት ቁጥር፡ 98A7B6C5D4። ቀሪ ሒሳብዎ ብር 1,200.00።',
    expected: {
      success: true,
      provider: 'TELEBIRR',
      transactionId: '98A7B6C5D4',
      amount: 250.0,
    },
  },
  {
    name: 'CBE English with FT Code and Comma in Amount',
    sms: 'Dear Customer, ETB 1,500.00 has been debited from your account 1000123456789 on 18/11/2026. Trans. ID: FT263229P8W0. Reason: Transfer to ATD BINGO.',
    expected: {
      success: true,
      provider: 'CBE',
      transactionId: 'FT263229P8W0',
      amount: 1500.0,
    },
  },
  {
    name: 'CBE Amharic with FT Code',
    sms: 'ውድ ደንበኛችን ብር 500.00 ከሂሳብ ቁጥር 1000... ወጪ ተደርጓል። የግብይት መለያ፡ FT26322AABBCC። ቀሪ ሒሳብዎ...',
    expected: {
      success: true,
      provider: 'CBE',
      transactionId: 'FT26322AABBCC',
      amount: 500.0,
    },
  },
  {
    name: 'Bank of Abyssinia English Ref No',
    sms: 'Dear Customer, ETB 300.00 was transferred to account 87654321. Ref No: BOA99887766. Thank you for banking with Bank of Abyssinia.',
    expected: {
      success: true,
      provider: 'BOA',
      transactionId: 'BOA99887766',
      amount: 300.0,
    },
  },
  {
    name: 'User manual shorthand (code + amount)',
    sms: 'FT263229P8W0 200',
    expected: {
      success: true,
      provider: 'CBE',
      transactionId: 'FT263229P8W0',
      amount: 200.0,
    },
  },
];

console.log('--- RUNNING SMS PARSER TEST SUITE ---');
let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = smsParser.parse(tc.sms);
  const ok =
    result.success === tc.expected.success &&
    result.transactionId === tc.expected.transactionId &&
    result.amount === tc.expected.amount &&
    result.provider === tc.expected.provider;

  if (ok) {
    console.log(`✅ PASS: ${tc.name}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${tc.name}`);
    console.error('   Expected:', tc.expected);
    console.error('   Got:     ', result);
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
