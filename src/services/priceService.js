const axios = require('axios');

const CACHE_TTL_MS = 60 * 1000;

class PriceService {
  constructor() {
    this._btcCache = null; // { rate: number, fetchedAt: number }
    this._ethCache = null;
    this._solCache = null;
  }

  /**
   * Retourne le taux BTC/USD courant.
   * Cache 60 secondes. Fallback Binance si CoinGecko indisponible.
   * @returns {Promise<number>}
   */
  async getBTCRate() {
    if (this._btcCache && Date.now() - this._btcCache.fetchedAt < CACHE_TTL_MS) {
      return this._btcCache.rate;
    }

    let rate;
    try {
      rate = await this._fetchFromCoinGecko('bitcoin');
    } catch {
      try {
        rate = await this._fetchFromBinance('BTCUSDT');
      } catch {
        throw new Error(
          'Impossible de récupérer le taux BTC/USD : CoinGecko et Binance indisponibles'
        );
      }
    }

    this._btcCache = { rate, fetchedAt: Date.now() };
    return rate;
  }

  /**
   * Retourne le taux ETH/USD courant.
   * Cache 60 secondes. Fallback Binance si CoinGecko indisponible.
   * @returns {Promise<number>}
   */
  async getETHRate() {
    if (this._ethCache && Date.now() - this._ethCache.fetchedAt < CACHE_TTL_MS) {
      return this._ethCache.rate;
    }

    let rate;
    try {
      rate = await this._fetchFromCoinGecko('ethereum');
    } catch {
      try {
        rate = await this._fetchFromBinance('ETHUSDT');
      } catch {
        throw new Error(
          'Impossible de récupérer le taux ETH/USD : CoinGecko et Binance indisponibles'
        );
      }
    }

    this._ethCache = { rate, fetchedAt: Date.now() };
    return rate;
  }

  /**
   * Retourne le taux SOL/USD courant.
   * Cache 60 secondes. Fallback Binance si CoinGecko indisponible.
   * @returns {Promise<number>}
   */
  async getSOLRate() {
    if (this._solCache && Date.now() - this._solCache.fetchedAt < CACHE_TTL_MS) {
      return this._solCache.rate;
    }

    let rate;
    try {
      rate = await this._fetchFromCoinGecko('solana');
    } catch {
      try {
        rate = await this._fetchFromBinance('SOLUSDT');
      } catch {
        throw new Error(
          'Impossible de récupérer le taux SOL/USD : CoinGecko et Binance indisponibles'
        );
      }
    }

    this._solCache = { rate, fetchedAt: Date.now() };
    return rate;
  }

  async _fetchFromCoinGecko(coinId) {
    const resp = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { timeout: 5000 }
    );
    return resp.data[coinId].usd;
  }

  async _fetchFromBinance(symbol) {
    const resp = await axios.get(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      { timeout: 5000 }
    );
    return parseFloat(resp.data.price);
  }

  _clearCache() {
    this._btcCache = null;
    this._ethCache = null;
    this._solCache = null;
  }

  _expireCache() {
    const expired = Date.now() - CACHE_TTL_MS - 1;
    if (this._btcCache) this._btcCache.fetchedAt = expired;
    if (this._ethCache) this._ethCache.fetchedAt = expired;
    if (this._solCache) this._solCache.fetchedAt = expired;
  }
}

module.exports = new PriceService();
