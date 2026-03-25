describe('Rate Limiter', () => {
  // Importer fresh pour chaque test (state en mémoire)
  let rateLimiter;

  beforeEach(() => {
    jest.resetModules();
    rateLimiter = require('../../src/middleware/rateLimiter');
  });

  function mockReqRes(ip = '127.0.0.1') {
    const req = { ip, connection: { remoteAddress: ip } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn(),
    };
    const next = jest.fn();
    return { req, res, next };
  }

  describe('globalLimiter', () => {
    it('laisse passer les requêtes sous la limite', () => {
      const { req, res, next } = mockReqRes();
      rateLimiter.globalLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('ajoute les headers X-RateLimit', () => {
      const { req, res, next } = mockReqRes();
      rateLimiter.globalLimiter(req, res, next);
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'X-RateLimit-Limit': expect.any(Number),
          'X-RateLimit-Remaining': expect.any(Number),
          'X-RateLimit-Reset': expect.any(String),
        })
      );
    });
  });

  describe('paymentCreateLimiter', () => {
    it('bloque après 10 requêtes', () => {
      const ip = '10.0.0.1';

      // 10 requêtes OK
      for (let i = 0; i < 10; i++) {
        const { req, res, next } = mockReqRes(ip);
        rateLimiter.paymentCreateLimiter(req, res, next);
        expect(next).toHaveBeenCalled();
      }

      // 11ème → bloquée
      const { req, res, next } = mockReqRes(ip);
      rateLimiter.paymentCreateLimiter(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'RATE_LIMIT_EXCEEDED',
          retryAfter: expect.any(Number),
        })
      );
    });

    it('traite des IPs différentes indépendamment', () => {
      // Saturer IP A
      for (let i = 0; i < 10; i++) {
        const { req, res, next } = mockReqRes('10.0.0.2');
        rateLimiter.paymentCreateLimiter(req, res, next);
      }

      // IP B doit encore passer
      const { req, res, next } = mockReqRes('10.0.0.3');
      rateLimiter.paymentCreateLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
