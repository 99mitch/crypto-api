// Mock config before importing
jest.mock('../../src/config', () => ({
  admin: {
    apiKey: 'test-admin-key-123',
    password: 'test-password',
    secret: 'test-secret-for-hmac-signing',
  },
}));

const { adminAuth, generateAdminToken, verifyAdminToken } = require('../../src/middleware/adminAuth');

describe('Admin Auth', () => {
  function mockReqRes(headers = {}) {
    const req = { headers, body: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();
    return { req, res, next };
  }

  describe('adminAuth middleware', () => {
    it('accepte une clé API valide via X-Admin-Key', () => {
      const { req, res, next } = mockReqRes({ 'x-admin-key': 'test-admin-key-123' });
      adminAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.adminAuth).toEqual({ method: 'api-key' });
    });

    it('rejette une clé API invalide', () => {
      const { req, res, next } = mockReqRes({ 'x-admin-key': 'wrong-key' });
      adminAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepte un Bearer token valide', () => {
      const token = generateAdminToken({ role: 'admin' });
      const { req, res, next } = mockReqRes({ authorization: `Bearer ${token}` });
      adminAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.adminAuth.method).toEqual('token');
      expect(req.adminAuth.role).toEqual('admin');
    });

    it('rejette un Bearer token invalide', () => {
      const { req, res, next } = mockReqRes({ authorization: 'Bearer invalid.token' });
      adminAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('retourne 401 sans authentification', () => {
      const { req, res, next } = mockReqRes({});
      adminAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Authentification requise' })
      );
    });
  });

  describe('Token generation & verification', () => {
    it('génère un token vérifiable', () => {
      const token = generateAdminToken({ role: 'admin', user: 'test' });
      const decoded = verifyAdminToken(token);
      expect(decoded.role).toEqual('admin');
      expect(decoded.user).toEqual('test');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('rejette un token expiré', () => {
      const token = generateAdminToken({}, 0); // expire immédiatement
      // Attendre 1ms pour que le token soit expiré
      expect(() => verifyAdminToken(token)).toThrow('Token expiré');
    });

    it('rejette un token modifié', () => {
      const token = generateAdminToken({ role: 'admin' });
      const [data, sig] = token.split('.');
      const tamperedToken = `${data}.${sig}x`;
      expect(() => verifyAdminToken(tamperedToken)).toThrow('Signature invalide');
    });

    it('rejette un format invalide', () => {
      expect(() => verifyAdminToken('no-dot-here')).toThrow('Format token invalide');
    });
  });
});
