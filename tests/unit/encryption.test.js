const { encrypt, decrypt, generateMasterKey } = require('../../src/utils/encryption');

describe('Encryption Utils', () => {
  const masterKey = generateMasterKey();

  describe('generateMasterKey()', () => {
    it('génère une clé de 64 caractères hex', () => {
      const key = generateMasterKey();
      expect(key).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(key)).toBe(true);
    });

    it('génère des clés uniques', () => {
      const key1 = generateMasterKey();
      const key2 = generateMasterKey();
      expect(key1).not.toEqual(key2);
    });
  });

  describe('encrypt() + decrypt()', () => {
    it('chiffre et déchiffre une clé privée correctement', () => {
      const privateKey = 'a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef01';
      const encrypted = encrypt(privateKey, masterKey);
      const decrypted = decrypt(encrypted, masterKey);
      expect(decrypted).toEqual(privateKey);
    });

    it('produit un résultat chiffré au format salt:iv:tag:data', () => {
      const encrypted = encrypt('test-data', masterKey);
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(4);
      // Salt = 32 bytes = 64 hex chars
      expect(parts[0]).toHaveLength(64);
      // IV = 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32);
      // Tag = 16 bytes = 32 hex chars
      expect(parts[2]).toHaveLength(32);
      // Data is non-empty
      expect(parts[3].length).toBeGreaterThan(0);
    });

    it('produit des chiffrements différents pour le même texte (salt/IV aléatoires)', () => {
      const plaintext = 'same-private-key';
      const enc1 = encrypt(plaintext, masterKey);
      const enc2 = encrypt(plaintext, masterKey);
      expect(enc1).not.toEqual(enc2);
      // Mais les deux déchiffrent vers le même texte
      expect(decrypt(enc1, masterKey)).toEqual(plaintext);
      expect(decrypt(enc2, masterKey)).toEqual(plaintext);
    });

    it('échoue avec une mauvaise clé maître', () => {
      const encrypted = encrypt('secret', masterKey);
      const wrongKey = generateMasterKey();
      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    it('échoue avec un format invalide', () => {
      expect(() => decrypt('invalid-format', masterKey)).toThrow('Format chiffré invalide');
    });

    it('échoue si la clé maître est vide', () => {
      expect(() => encrypt('data', '')).toThrow('ENCRYPTION_KEY manquante');
      expect(() => decrypt('a:b:c:d', '')).toThrow('ENCRYPTION_KEY manquante');
    });

    it('gère les chaînes vides', () => {
      const encrypted = encrypt('', masterKey);
      const decrypted = decrypt(encrypted, masterKey);
      expect(decrypted).toEqual('');
    });

    it('gère les caractères spéciaux et unicode', () => {
      const special = '🔑 clé privée avec accents éàü';
      const encrypted = encrypt(special, masterKey);
      const decrypted = decrypt(encrypted, masterKey);
      expect(decrypted).toEqual(special);
    });
  });
});
