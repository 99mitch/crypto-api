// tests/unit/adminController.refund.test.js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const Payment = require('../../src/models/Payment');

test('Payment model accepts refunded status', async () => {
  const p = new Payment({
    paymentId: 'PAY-TEST1',
    amount: 20,
    usdAmount: 20,
    status: 'refunded',
    wallet: { address: 'TTest1', privateKey: 'pk1', base58: 'TTest1' },
    expiresAt: new Date(Date.now() + 3600000),
    requiredConfirmations: 1,
  });
  await p.save();
  const found = await Payment.findOne({ paymentId: 'PAY-TEST1' });
  expect(found.status).toBe('refunded');
  expect(found.refundTxHash).toBeNull();
  expect(found.refundedAt).toBeNull();
});

test('Payment model stores refundTxHash and refundedAt', async () => {
  const p = await Payment.findOne({ paymentId: 'PAY-TEST1' });
  p.status = 'refunded';
  p.refundTxHash = 'abc123txhash';
  p.refundedAt = new Date();
  await p.save();
  const updated = await Payment.findOne({ paymentId: 'PAY-TEST1' });
  expect(updated.refundTxHash).toBe('abc123txhash');
  expect(updated.refundedAt).toBeInstanceOf(Date);
});

test('toAdminJSON includes refund fields', async () => {
  const p = await Payment.findOne({ paymentId: 'PAY-TEST1' });
  const json = p.toAdminJSON();
  expect(json).toHaveProperty('refundTxHash');
  expect(json).toHaveProperty('refundedAt');
});
