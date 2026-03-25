const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Dérive une clé AES-256 à partir d'un secret + salt
 */
function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Chiffre une chaîne avec AES-256-GCM
 * Format de sortie : salt:iv:tag:encrypted (tout en hex)
 * @param {string} plaintext - Texte à chiffrer (ex: clé privée)
 * @param {string} masterKey - Clé maître (depuis .env)
 * @returns {string} Texte chiffré encodé
 */
function encrypt(plaintext, masterKey) {
  if (!masterKey) {
    throw new Error('ENCRYPTION_KEY manquante dans .env');
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return [
    salt.toString('hex'),
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted,
  ].join(':');
}

/**
 * Déchiffre une chaîne chiffrée avec AES-256-GCM
 * @param {string} encryptedText - Format salt:iv:tag:encrypted
 * @param {string} masterKey - Clé maître
 * @returns {string} Texte en clair
 */
function decrypt(encryptedText, masterKey) {
  if (!masterKey) {
    throw new Error('ENCRYPTION_KEY manquante dans .env');
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 4) {
    throw new Error('Format chiffré invalide');
  }

  const [saltHex, ivHex, tagHex, encrypted] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const key = deriveKey(masterKey, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Génère une clé maître aléatoire (à mettre dans .env)
 * @returns {string} Clé de 64 caractères hex
 */
function generateMasterKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { encrypt, decrypt, generateMasterKey };
