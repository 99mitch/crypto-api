const axios = require('axios');

const CACHE_TTL_MS = 60 * 1000;

class PriceService {
  constructor() {
    this._cache = null; // { rate: number, fetchedAt: number }
  }

  /**
   * Retourne le taux BTC/USD courant.
   * Cache 60 secondes. Fallback Binance si CoinGecko indisponible.
   * @returns {Promise<number>}
   */
  async getBTCRate() {
    if (this._cache && Date.now() - this._cache.fetchedAt < CACHE_TTL_MS) {
      return this._cache.rate;
    }

    let rate;
    try {
      rate = await this._fetchFromCoinGecko();
    } catch {
      try {
        rate = await this._fetchFromBinance();
      } catch {
        throw new Error(
          'Impossible de récupérer le taux BTC/USD : CoinGecko et Binance indisponibles'
        );
      }
    }

    this._cache = { rate, fetchedAt: Date.now() };
    return rate;
  }

  async _fetchFromCoinGecko() {
    const resp = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { timeout: 5000 }
    );
    return resp.data.bitcoin.usd;
  }

  async _fetchFromBinance() {
    const resp = await axios.get(
      'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      { timeout: 5000 }
    );
    return parseFloat(resp.data.price);
  }

  _clearCache() {
    this._cache = null;
  }

  _expireCache() {
    if (this._cache) {
      this._cache.fetchedAt = Date.now() - CACHE_TTL_MS - 1;
    }
  }
}

module.exports = new PriceService();
