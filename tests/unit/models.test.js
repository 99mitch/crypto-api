const { connectTestDB, disconnectTestDB, clearTestDB } = require('../setup');
const Payment = require('../../src/models/Payment');
const AuditLog = require('../../src/models/AuditLog');

beforeAll(async () => await connectTestDB());
afterEach(async () => await clearTestDB());
afterAll(async () => await disconnectTestDB());

describe('Payment Model', () => {
  const validPayment = {
    paymentId: 'PAY-TEST001',
    amount: 50,
    status: 'pending',
    wallet: {
      address: 'TTestAddress123456789012345678901',
      privateKey: 'encrypted-private-key-data',
      base58: 'TTestAddress123456789012345678901',
    },
    expiresAt: new Date(Date.now() + 15 * 60000),
  };

  it('crée un paiement valide', async () => {
    const payment = await Payment.create(validPayment);
    expect(payment.paymentId).toEqual('PAY-TEST001');
    expect(payment.amount).toEqual(50);
    expect(payment.status).toEqual('pending');
    expect(payment.createdAt).toBeDefined();
  });

  it('rejette un montant < 0.01', async () => {
    await expect(
      Payment.create({ ...validPayment, paymentId: 'PAY-TEST002', amount: 0 })
    ).rejects.toThrow();
  });

  it('rejette un statut invalide', async () => {
    await expect(
      Payment.create({ ...validPayment, paymentId: 'PAY-TEST003', status: 'invalid' })
    ).rejects.toThrow();
  });

  it('rejette un paymentId dupliqué', async () => {
    await Payment.create(validPayment);
    await expect(Payment.create(validPayment)).rejects.toThrow();
  });

  describe('isExpired()', () => {
    it('retourne true si expiré et pending', async () => {
      const payment = await Payment.create({
        ...validPayment,
        paymentId: 'PAY-EXP001',
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(payment.isExpired()).toBe(true);
    });

    it('retourne false si non expiré', async () => {
      const payment = await Payment.create({
        ...validPayment,
        paymentId: 'PAY-EXP002',
      });
      expect(payment.isExpired()).toBe(false);
    });

    it('retourne false si confirmé même après expiration', async () => {
      const payment = await Payment.create({
        ...validPayment,
        paymentId: 'PAY-EXP003',
        status: 'confirmed',
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(payment.isExpired()).toBe(false);
    });
  });

  describe('toPublicJSON()', () => {
    it('masque la clé privée', async () => {
      const payment = await Payment.create(validPayment);
      const json = payment.toPublicJSON();
      expect(json.walletAddress).toBeDefined();
      expect(json.privateKey).toBeUndefined();
      expect(json.wallet).toBeUndefined();
    });

    it('inclut le QR code', async () => {
      const payment = await Payment.create({
        ...validPayment,
        paymentId: 'PAY-QR001',
        qrCode: 'data:image/png;base64,abc123',
      });
      const json = payment.toPublicJSON();
      expect(json.qrCode).toEqual('data:image/png;base64,abc123');
    });
  });

  describe('toAdminJSON()', () => {
    it('inclut les champs admin', async () => {
      const payment = await Payment.create({
        ...validPayment,
        paymentId: 'PAY-ADM001',
        webhookAttempts: 2,
        confirmations: 1,
      });
      const json = payment.toAdminJSON();
      expect(json.confirmations).toEqual(1);
      expect(json.webhookAttempts).toEqual(2);
    });
  });
});

describe('AuditLog Model', () => {
  describe('AuditLog.log()', () => {
    it('crée un log simple', async () => {
      await AuditLog.log({
        paymentId: 'PAY-LOG001',
        action: 'payment_created',
        details: { amount: 50 },
      });

      const logs = await AuditLog.find({ paymentId: 'PAY-LOG001' });
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toEqual('payment_created');
      expect(logs[0].details.amount).toEqual(50);
    });

    it('enregistre l\'IP et le user-agent depuis req', async () => {
      const fakeReq = {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'TestAgent/1.0' },
      };

      await AuditLog.log({
        paymentId: 'PAY-LOG002',
        action: 'admin_login',
        req: fakeReq,
      });

      const log = await AuditLog.findOne({ paymentId: 'PAY-LOG002' });
      expect(log.ip).toEqual('192.168.1.1');
      expect(log.userAgent).toEqual('TestAgent/1.0');
    });

    it('ne crash pas avec des données invalides', async () => {
      // Le log ne doit jamais casser l'app
      await expect(
        AuditLog.log({ action: 'invalid_action_that_does_not_exist' })
      ).resolves.not.toThrow();
    });
  });

  describe('AuditLog.getPaymentHistory()', () => {
    it('retourne l\'historique dans l\'ordre chronologique', async () => {
      await AuditLog.create([
        { paymentId: 'PAY-HIST01', action: 'payment_created', createdAt: new Date('2024-01-01') },
        { paymentId: 'PAY-HIST01', action: 'payment_confirmed', createdAt: new Date('2024-01-02') },
        { paymentId: 'PAY-HIST01', action: 'sweep_completed', createdAt: new Date('2024-01-03') },
        { paymentId: 'PAY-OTHER', action: 'payment_created', createdAt: new Date('2024-01-01') },
      ]);

      const history = await AuditLog.getPaymentHistory('PAY-HIST01');
      expect(history).toHaveLength(3);
      expect(history[0].action).toEqual('payment_created');
      expect(history[2].action).toEqual('sweep_completed');
    });
  });

  describe('AuditLog.search()', () => {
    beforeEach(async () => {
      await AuditLog.create([
        { paymentId: 'PAY-S001', action: 'payment_created', level: 'info' },
        { paymentId: 'PAY-S002', action: 'sweep_failed', level: 'error' },
        { paymentId: 'PAY-S003', action: 'webhook_sent', level: 'info' },
        { paymentId: 'PAY-S004', action: 'sweep_failed', level: 'error' },
      ]);
    });

    it('filtre par action', async () => {
      const result = await AuditLog.search({ action: 'sweep_failed' });
      expect(result.logs).toHaveLength(2);
      expect(result.total).toEqual(2);
    });

    it('filtre par level', async () => {
      const result = await AuditLog.search({ level: 'error' });
      expect(result.logs).toHaveLength(2);
    });

    it('pagine correctement', async () => {
      const page1 = await AuditLog.search({ limit: 2, page: 1 });
      const page2 = await AuditLog.search({ limit: 2, page: 2 });
      expect(page1.logs).toHaveLength(2);
      expect(page2.logs).toHaveLength(2);
      expect(page1.totalPages).toEqual(2);
    });
  });
});
