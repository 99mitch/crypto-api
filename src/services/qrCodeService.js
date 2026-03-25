const QRCode = require('qrcode');

class QRCodeService {
  /**
   * Génère un QR code en base64 (data URI) pour une adresse de paiement
   * Format TronLink compatible: tron:{address}?amount={amount}&token=USDT
   * @param {string} address - Adresse Tron du wallet
   * @param {number} amount - Montant en USDT
   * @param {object} options - Options de génération
   * @returns {string} Data URI du QR code (image PNG base64)
   */
  async generatePaymentQR(address, amount, options = {}) {
    const {
      width = 300,
      margin = 2,
      darkColor = '#000000',
      lightColor = '#ffffff',
      format = 'datauri', // 'datauri' | 'buffer' | 'svg'
    } = options;

    // URI compatible wallets Tron (TronLink, Trust Wallet, etc.)
    const paymentUri = this._buildPaymentUri(address, amount);

    const qrOptions = {
      width,
      margin,
      color: {
        dark: darkColor,
        light: lightColor,
      },
      errorCorrectionLevel: 'M',
    };

    try {
      switch (format) {
        case 'buffer':
          return await QRCode.toBuffer(paymentUri, qrOptions);

        case 'svg':
          return await QRCode.toString(paymentUri, { ...qrOptions, type: 'svg' });

        case 'datauri':
        default:
          return await QRCode.toDataURL(paymentUri, qrOptions);
      }
    } catch (error) {
      console.error('Erreur génération QR code:', error.message);
      throw new Error('Impossible de générer le QR code');
    }
  }

  /**
   * Génère un QR code simple avec juste l'adresse
   * (plus universel, compatible tous les wallets)
   * @param {string} address
   * @param {object} options
   * @returns {string} Data URI
   */
  async generateAddressQR(address, options = {}) {
    const { width = 300, margin = 2 } = options;

    return await QRCode.toDataURL(address, {
      width,
      margin,
      errorCorrectionLevel: 'M',
    });
  }

  /**
   * Construit l'URI de paiement
   * @param {string} address
   * @param {number} amount
   * @returns {string}
   */
  _buildPaymentUri(address, amount) {
    // Format simple: juste l'adresse
    // La plupart des wallets ne supportent pas le format URI étendu pour TRC-20
    // Donc on garde l'adresse simple pour maximiser la compatibilité
    return address;
  }
}

module.exports = new QRCodeService();
