const crypto = require('crypto');
const config = require('../config');

/**
 * Middleware d'authentification admin
 * Supporte 2 modes :
 *   1. API Key via header X-Admin-Key (simple, idéal pour usage interne)
 *   2. Bearer token signé HMAC (pour le dashboard)
 */

/**
 * Vérifie la clé admin dans le header
 */
function adminAuth(req, res, next) {
  const apiKey = req.headers['x-admin-key'];
  const bearerToken = req.headers['authorization']?.replace('Bearer ', '');

  // Mode 1 : API Key directe
  if (apiKey) {
    if (!config.admin.apiKey) {
      return res.status(500).json({ error: 'ADMIN_API_KEY non configurée côté serveur' });
    }

    // Comparaison timing-safe pour éviter les timing attacks
    const keyBuffer = Buffer.from(apiKey);
    const expectedBuffer = Buffer.from(config.admin.apiKey);

    if (keyBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(keyBuffer, expectedBuffer)) {
      return res.status(401).json({ error: 'Clé admin invalide' });
    }

    req.adminAuth = { method: 'api-key' };
    return next();
  }

  // Mode 2 : Bearer token signé
  if (bearerToken) {
    try {
      const decoded = verifyAdminToken(bearerToken);
      req.adminAuth = { method: 'token', ...decoded };
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Token admin invalide ou expiré' });
    }
  }

  return res.status(401).json({
    error: 'Authentification requise',
    hint: 'Envoyez X-Admin-Key ou Authorization: Bearer <token>',
  });
}

/**
 * Génère un token admin signé HMAC-SHA256 (pour le login dashboard)
 * @param {object} payload - Données à inclure (ex: { role: 'admin' })
 * @param {number} expiresInHours - Durée de validité (défaut: 24h)
 * @returns {string} Token encodé base64
 */
function generateAdminToken(payload = {}, expiresInHours = 24) {
  const header = {
    ...payload,
    iat: Date.now(),
    exp: Date.now() + expiresInHours * 3600000,
  };

  const data = Buffer.from(JSON.stringify(header)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', config.admin.secret)
    .update(data)
    .digest('base64url');

  return `${data}.${signature}`;
}

/**
 * Vérifie et décode un token admin
 * @param {string} token
 * @returns {object} Payload décodé
 */
function verifyAdminToken(token) {
  const [data, signature] = token.split('.');
  if (!data || !signature) throw new Error('Format token invalide');

  const expectedSig = crypto
    .createHmac('sha256', config.admin.secret)
    .update(data)
    .digest('base64url');

  if (signature !== expectedSig) throw new Error('Signature invalide');

  const payload = JSON.parse(Buffer.from(data, 'base64url').toString());

  if (payload.exp && Date.now() > payload.exp) {
    throw new Error('Token expiré');
  }

  return payload;
}

/**
 * Route de login admin
 * POST /api/admin/login { password: "..." }
 */
function adminLogin(req, res) {
  const { password } = req.body;

  if (!password || password !== config.admin.password) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const token = generateAdminToken({ role: 'admin' });

  return res.json({
    success: true,
    token,
    expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
  });
}

module.exports = { adminAuth, adminLogin, generateAdminToken, verifyAdminToken };
