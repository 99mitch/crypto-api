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

// Mock tronService for controller tests
jest.mock('../../src/services/tronService', () => ({
  ensureGasForSweep: jest.fn().mockResolvedValue(undefined),
  sweepUSDT: jest.fn().mockResolvedValue('mocktxhash456'),
}));
jest.mock('../../src/utils/encryption', () => ({
  decrypt: (k) => k,
}));
jest.mock('../../src/models/AuditLog', () => ({
  log: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/config', () => ({
  encryption: { masterKey: null },
  btc: { network: 'mainnet', blockcypherToken: '', centralWallet: {}, feesWalletAddress: null, payment: {} },
  tron: { fullHost: '', apiKey: '', network: 'shasta', usdtContract: '', centralWallet: {} },
  payment: { expirationMinutes: 15, checkIntervalSeconds: 10, amountTolerance: 0.015, gracePeriodSeconds: 120 },
  sweep: { minTrxForGas: 15000000, feeLimit: 30000000 },
  fees: { walletAddress: null, percentage: 0.03 },
  admin: { apiKey: '', password: 'changeme', secret: 'dev-secret' },
  webhook: { internalUrl: '', secret: '' },
  mongodb: { uri: 'mongodb://localhost:27017/test' },
}));

const adminController = require('../../src/controllers/adminController');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

test('refundPayment returns 404 for unknown paymentId', async () => {
  const req = { params: { paymentId: 'PAY-UNKNOWN' } };
  const res = makeRes();
  await adminController.refundPayment(req, res);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
});

test('refundPayment returns 400 if status is pending', async () => {
  await Payment.create({
    paymentId: 'PAY-PENDING',
    amount: 10,
    usdAmount: 10,
    status: 'pending',
    senderAddress: 'TSender1',
    receivedAmount: 10,
    wallet: { address: 'TWallet1', privateKey: 'pk1', base58: 'TWallet1' },
    expiresAt: new Date(Date.now() + 3600000),
    requiredConfirmations: 1,
  });
  const req = { params: { paymentId: 'PAY-PENDING' } };
  const res = makeRes();
  await adminController.refundPayment(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test('refundPayment returns 400 if senderAddress is null', async () => {
  await Payment.create({
    paymentId: 'PAY-NOSENDER',
    amount: 10,
    usdAmount: 10,
    status: 'confirmed',
    senderAddress: null,
    receivedAmount: 10,
    wallet: { address: 'TWallet2', privateKey: 'pk2', base58: 'TWallet2' },
    expiresAt: new Date(Date.now() + 3600000),
    requiredConfirmations: 1,
  });
  const req = { params: { paymentId: 'PAY-NOSENDER' } };
  const res = makeRes();
  await adminController.refundPayment(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('sender') }));
});

test('refundPayment sweeps and marks refunded', async () => {
  await Payment.create({
    paymentId: 'PAY-REFUNDOK',
    amount: 20,
    usdAmount: 20,
    status: 'confirmed',
    senderAddress: 'TSender2',
    receivedAmount: 20,
    wallet: { address: 'TWallet3', privateKey: 'pk3', base58: 'TWallet3' },
    expiresAt: new Date(Date.now() + 3600000),
    requiredConfirmations: 1,
  });
  const req = { params: { paymentId: 'PAY-REFUNDOK' } };
  const res = makeRes();
  await adminController.refundPayment(req, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, txHash: 'mocktxhash456' }));
  const updated = await Payment.findOne({ paymentId: 'PAY-REFUNDOK' });
  expect(updated.status).toBe('refunded');
  expect(updated.refundTxHash).toBe('mocktxhash456');
  expect(updated.refundedAt).toBeInstanceOf(Date);
});

test('refundPayment returns 400 if already refunded', async () => {
  const req = { params: { paymentId: 'PAY-REFUNDOK' } };
  const res = makeRes();
  await adminController.refundPayment(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Payment already refunded' }));
});
