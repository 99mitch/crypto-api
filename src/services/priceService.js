const axios = require('axios');

const CACHE_TTL_MS = 60 * 1000;

class PriceService {
  constructor() {
    this._caches = {}; // { BTC: { rate, fetchedAt }, ETH: { rate, fetchedAt }, SOL: { rate, fetchedAt } }
  }

  /**
   * Retourne le taux BTC/USD courant.
   * Cache 60 secondes. Fallback Binance si CoinGecko indisponible.
   * @returns {Promise<number>}
   */
  async getBTCRate() {
    return this._getRate('BTC', 'bitcoin', 'BTCUSDT');
  }

  /**
   * Retourne le taux ETH/USD courant.
   * @returns {Promise<number>}
   */
  async getETHRate() {
    return this._getRate('ETH', 'ethereum', 'ETHUSDT');
  }

  /**
   * Retourne le taux SOL/USD courant.
   * @returns {Promise<number>}
   */
  async getSOLRate() {
    return this._getRate('SOL', 'solana', 'SOLUSDT');
  }

  /**
   * Récupère le taux d'une crypto (avec cache).
   * @param {string} symbol - Clé interne (BTC, ETH, SOL)
   * @param {string} geckoId - ID CoinGecko
   * @param {string} binanceSymbol - Paire Binance
   * @returns {Promise<number>}
   */
  async _getRate(symbol, geckoId, binanceSymbol) {
    const cached = this._caches[symbol];
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.rate;
    }

    let rate;
    try {
      rate = await this._fetchFromCoinGecko(geckoId);
    } catch {
      try {
        rate = await this._fetchFromBinance(binanceSymbol);
      } catch {
        throw new Error(
          `Impossible de récupérer le taux ${symbol}/USD : CoinGecko et Binance indisponibles`
        );
      }
    }

    this._caches[symbol] = { rate, fetchedAt: Date.now() };
    return rate;
  }

  async _fetchFromCoinGecko(geckoId) {
    const resp = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
      { timeout: 5000 }
    );
    return resp.data[geckoId].usd;
  }

  async _fetchFromBinance(symbol) {
    const resp = await axios.get(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      { timeout: 5000 }
    );
    return parseFloat(resp.data.price);
  }

  _clearCache() {
    this._caches = {};
  }

  _expireCache() {
    Object.keys(this._caches).forEach(k => {
      this._caches[k].fetchedAt = Date.now() - CACHE_TTL_MS - 1;
    });
  }
}

module.exports = new PriceService();
