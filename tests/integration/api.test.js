const express = require('express');
const supertest = require('supertest');
const { connectTestDB, disconnectTestDB, clearTestDB } = require('../setup');

// Mock tronService pour ne pas toucher la vraie blockchain
jest.mock('../../src/services/tronService', () => ({
  generateWallet: jest.fn().mockResolvedValue({
    address: 'TMockWalletAddress123456789012345',
    privateKey: 'mock-private-key-abcdef0123456789',
    base58: 'TMockWalletAddress123456789012345',
  }),
  getUSDTBalance: jest.fn().mockResolvedValue(0),
  getIncomingUSDTTransactions: jest.fn().mockResolvedValue([]),
  sweepUSDT: jest.fn().mockResolvedValue('mock-sweep-tx-hash'),
  getTRXBalance: jest.fn().mockResolvedValue(100),
}));

// Mock btcService pour ne pas toucher la vraie blockchain BTC
jest.mock('../../src/services/btcService', () => ({
  generateWallet: jest.fn().mockResolvedValue({
    address: 'bc1mockbtcaddress123456789012345678',
    wif: 'mock-wif-key',
  }),
  getBalance: jest.fn().mockResolvedValue(0),
  getIncomingTransactions: jest.fn().mockResolvedValue([]),
  sweep: jest.fn().mockResolvedValue('mock-btc-sweep-tx-hash'),
}));

// Mock qrCodeService
jest.mock('../../src/services/qrCodeService', () => ({
  generatePaymentQR: jest.fn().mockResolvedValue('data:image/png;base64,mockQRdata'),
}));

// Bypass rate limiting in tests
jest.mock('../../src/middleware/rateLimiter', () => ({
  globalLimiter: (req, res, next) => next(),
  paymentCreateLimiter: (req, res, next) => next(),
  statusPollLimiter: (req, res, next) => next(),
  adminLimiter: (req, res, next) => next(),
}));

// Mock config
jest.mock('../../src/config', () => ({
  port: 3999,
  nodeEnv: 'test',
  mongodb: { uri: 'test' },
  tron: {
    fullHost: 'https://api.shasta.trongrid.io',
    apiKey: 'test',
    network: 'shasta',
    usdtContract: 'TTestContract',
    centralWallet: { address: 'TCentral', privateKey: 'central-key' },
  },
  payment: { expirationMinutes: 15, checkIntervalSeconds: 60 },
  webhook: { internalUrl: 'http://localhost:3999/api/internal/payment-confirmed', secret: 'test-secret' },
  sweep: { minTrxForGas: 15000000, feeLimit: 30000000 },
  admin: { apiKey: 'test-admin-key', password: 'test-password', secret: 'test-admin-secret' },
  encryption: { masterKey: null }, // Pas de chiffrement dans les tests
  btc: {
    network: 'testnet',
    blockcypherToken: 'test-token',
    centralWallet: { address: 'bc1testcentral', wif: 'test-wif' },
    feesWalletAddress: null,
    payment: { expirationMinutes: 60, requiredConfirmations: 1, amountTolerance: 0.015 },
  },
}));

let app;
let request;

beforeAll(async () => {
  await connectTestDB();

  // Build Express app sans démarrer le serveur
  app = express();
  app.use(express.json());
  app.use('/api/payments', require('../../src/routes/payment'));
  app.use('/api/admin', require('../../src/routes/admin'));
  app.use('/api/internal', require('../../src/routes/webhook'));
  app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

  request = supertest(app);
});

afterEach(async () => await clearTestDB());
afterAll(async () => await disconnectTestDB());

// ===================================================================
// PAYMENT ENDPOINTS
// ===================================================================
describe('POST /api/payments', () => {
  it('crée un paiement avec succès', async () => {
    const res = await request.post('/api/payments').send({
      amount: 50,
      description: 'Test payment',
      metadata: { orderId: 'ORD-123' },
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.payment).toMatchObject({
      amount: 50,
      status: 'pending',
      walletAddress: 'TMockWalletAddress123456789012345',
      description: 'Test payment',
      qrCode: 'data:image/png;base64,mockQRdata',
    });
    expect(res.body.payment.paymentId).toMatch(/^PAY-/);
    expect(res.body.payment.expiresAt).toBeDefined();
  });

  it('rejette un montant nul', async () => {
    const res = await request.post('/api/payments').send({ amount: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejette un montant négatif', async () => {
    const res = await request.post('/api/payments').send({ amount: -10 });
    expect(res.status).toBe(400);
  });

  it('rejette un montant trop petit', async () => {
    const res = await request.post('/api/payments').send({ amount: 0.001 });
    expect(res.status).toBe(400);
  });

  it('rejette une requête sans montant', async () => {
    const res = await request.post('/api/payments').send({});
    expect(res.status).toBe(400);
  });

  it('retourne le même paiement sur retry avec externalRef identique', async () => {
    const payload = { amount: 50, externalRef: 'recharge-USR123-1743200000' };

    const res1 = await request.post('/api/payments').send(payload);
    const res2 = await request.post('/api/payments').send(payload);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.payment.paymentId).toEqual(res2.body.payment.paymentId);
    expect(res1.body.payment.externalRef).toEqual('recharge-USR123-1743200000');
  });
});

describe('GET /api/payments/:paymentId', () => {
  it('récupère un paiement existant', async () => {
    const createRes = await request.post('/api/payments').send({ amount: 100 });
    const paymentId = createRes.body.payment.paymentId;

    const res = await request.get(`/api/payments/${paymentId}`);
    expect(res.status).toBe(200);
    expect(res.body.payment.paymentId).toEqual(paymentId);
    expect(res.body.payment.amount).toEqual(100);
  });

  it('retourne 404 pour un paiement inexistant', async () => {
    const res = await request.get('/api/payments/PAY-INEXISTANT');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/payments/:paymentId/status', () => {
  it('retourne le statut léger', async () => {
    const createRes = await request.post('/api/payments').send({ amount: 75 });
    const paymentId = createRes.body.payment.paymentId;

    const res = await request.get(`/api/payments/${paymentId}/status`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      paymentId,
      status: 'pending',
      receivedAmount: 0,
    });
    expect(res.body.expiresAt).toBeDefined();
    // Ne contient PAS les champs lourds
    expect(res.body.walletAddress).toBeUndefined();
    expect(res.body.metadata).toBeUndefined();
  });
});

describe('POST /api/payments/:paymentId/cancel', () => {
  it('annule un paiement pending', async () => {
    const createRes = await request.post('/api/payments').send({ amount: 25 });
    const paymentId = createRes.body.payment.paymentId;

    const res = await request.post(`/api/payments/${paymentId}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.payment.status).toEqual('cancelled');
  });

  it('ne peut pas annuler un paiement inexistant', async () => {
    const res = await request.post('/api/payments/PAY-FAKE/cancel');
    expect(res.status).toBe(404);
  });
});

// ===================================================================
// ADMIN ENDPOINTS
// ===================================================================
const adminHeaders = { 'x-admin-key': 'test-admin-key' };

describe('POST /api/admin/login', () => {
  it('retourne un token avec le bon mot de passe', async () => {
    const res = await request
      .post('/api/admin/login')
      .send({ password: 'test-password' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.expiresAt).toBeDefined();
  });

  it('rejette un mauvais mot de passe', async () => {
    const res = await request
      .post('/api/admin/login')
      .send({ password: 'wrong' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/stats', () => {
  it('retourne les stats avec auth', async () => {
    // Créer quelques paiements
    await request.post('/api/payments').send({ amount: 50 });
    await request.post('/api/payments').send({ amount: 100 });

    const res = await request.get('/api/admin/stats').set(adminHeaders);
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({
      totalPayments: 2,
      byStatus: expect.any(Object),
      totalRevenue: expect.any(Number),
      today: expect.any(Object),
    });
  });

  it('rejette sans auth', async () => {
    const res = await request.get('/api/admin/stats');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/payments', () => {
  beforeEach(async () => {
    await request.post('/api/payments').send({ amount: 10 });
    await request.post('/api/payments').send({ amount: 20 });
    await request.post('/api/payments').send({ amount: 30 });
  });

  it('liste tous les paiements', async () => {
    const res = await request.get('/api/admin/payments').set(adminHeaders);
    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(3);
    expect(res.body.total).toEqual(3);
  });

  it('filtre par statut', async () => {
    const res = await request
      .get('/api/admin/payments?status=pending')
      .set(adminHeaders);
    expect(res.status).toBe(200);
    expect(res.body.payments.every((p) => p.status === 'pending')).toBe(true);
  });

  it('pagine correctement', async () => {
    const res = await request
      .get('/api/admin/payments?page=1&limit=2')
      .set(adminHeaders);
    expect(res.body.payments).toHaveLength(2);
    expect(res.body.totalPages).toEqual(2);
  });
});

describe('GET /api/admin/payments/:paymentId/history', () => {
  it('retourne l\'audit trail d\'un paiement', async () => {
    const createRes = await request.post('/api/payments').send({ amount: 50 });
    const paymentId = createRes.body.payment.paymentId;

    const res = await request
      .get(`/api/admin/payments/${paymentId}/history`)
      .set(adminHeaders);

    expect(res.status).toBe(200);
    expect(res.body.history).toBeInstanceOf(Array);
    // Le log payment_created devrait être là
    expect(res.body.history.some((h) => h.action === 'payment_created')).toBe(true);
  });
});

describe('GET /api/admin/audit-logs', () => {
  it('retourne les logs d\'audit avec filtres', async () => {
    // Créer un paiement (génère un log)
    await request.post('/api/payments').send({ amount: 50 });

    const res = await request
      .get('/api/admin/audit-logs?action=payment_created')
      .set(adminHeaders);

    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThanOrEqual(1);
  });
});

// ===================================================================
// HEALTH CHECK
// ===================================================================
describe('GET /api/health', () => {
  it('retourne le statut OK', async () => {
    const res = await request.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toEqual('ok');
  });
});

describe('POST /api/admin/payments/:paymentId/cancel', () => {
  it('annule un paiement en attente', async () => {
    const createRes = await request
      .post('/api/payments')
      .send({ amount: 10, currency: 'USDT' })
    const paymentId = createRes.body.payment.paymentId

    const res = await request
      .post(`/api/admin/payments/${paymentId}/cancel`)
      .set(adminHeaders)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.payment.status).toBe('cancelled')
  })

  it('retourne 400 si le paiement n\'est pas en attente', async () => {
    const createRes = await request
      .post('/api/payments')
      .send({ amount: 10, currency: 'USDT' })
    const paymentId = createRes.body.payment.paymentId

    // Cancel once
    await request
      .post(`/api/admin/payments/${paymentId}/cancel`)
      .set(adminHeaders)

    // Try to cancel again
    const res = await request
      .post(`/api/admin/payments/${paymentId}/cancel`)
      .set(adminHeaders)

    expect(res.status).toBe(400)
  })

  it('retourne 404 pour un paymentId inconnu', async () => {
    const res = await request
      .post('/api/admin/payments/PAY-UNKNOWN/cancel')
      .set(adminHeaders)

    expect(res.status).toBe(404)
  })

  it('retourne 401 sans authentification', async () => {
    const createRes = await request
      .post('/api/payments')
      .send({ amount: 10, currency: 'USDT' })
    const paymentId = createRes.body.payment.paymentId

    const res = await request.post(`/api/admin/payments/${paymentId}/cancel`)
    expect(res.status).toBe(401)
  })
})
