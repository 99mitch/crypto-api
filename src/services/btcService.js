const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const { ECPairFactory } = require('ecpair');
const axios = require('axios');
const config = require('../config');

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

class BtcService {
  constructor() {
    this.network = config.btc.network === 'testnet'
      ? bitcoin.networks.testnet
      : bitcoin.networks.bitcoin;

    this.baseUrl = config.btc.network === 'testnet'
      ? 'https://api.blockcypher.com/v1/btc/test3'
      : 'https://api.blockcypher.com/v1/btc/main';
  }

  _tokenParams() {
    return config.btc.blockcypherToken
      ? { token: config.btc.blockcypherToken }
      : {};
  }

  /**
   * Génère un wallet Bitcoin P2WPKH (bech32, format bc1q...)
   * @returns {{ address: string, privateKeyWIF: string, publicKey: Buffer }}
   */
  generateWallet() {
    const keyPair = ECPair.makeRandom({ network: this.network });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });
    return {
      address,
      privateKeyWIF: keyPair.toWIF(),
      publicKey: keyPair.publicKey,
    };
  }

  /**
   * Solde BTC confirmé via Blockcypher
   * @param {string} address
   * @returns {Promise<number>} Solde en BTC
   */
  async getBalance(address) {
    try {
      const resp = await axios.get(`${this.baseUrl}/addrs/${address}/balance`, {
        params: this._tokenParams(),
        timeout: 10000,
      });
      return resp.data.balance / 1e8;
    } catch (error) {
      console.error(`Erreur getBalance BTC pour ${address}:`, error.message);
      return 0;
    }
  }

  /**
   * Transactions BTC reçues (non dépensées) sur une adresse
   * @param {string} address
   * @param {number} sinceTimestamp
   * @returns {Promise<Array<{ txHash, amount, confirmations, timestamp }>>}
   */
  async getIncomingTransactions(address, sinceTimestamp) {
    try {
      const resp = await axios.get(`${this.baseUrl}/addrs/${address}`, {
        params: this._tokenParams(),
        timeout: 10000,
      });
      const txrefs = resp.data.txrefs || [];
      return txrefs
        .filter(tx => !tx.spent && tx.tx_output_n >= 0)
        .map(tx => ({
          txHash: tx.tx_hash,
          amount: tx.value / 1e8,
          confirmations: tx.confirmations || 0,
          timestamp: tx.confirmed ? new Date(tx.confirmed).getTime() : Date.now(),
        }));
    } catch (error) {
      console.error(`Erreur getIncomingTransactions BTC pour ${address}:`, error.message);
      return [];
    }
  }

  /**
   * Nombre de confirmations d'une transaction BTC
   * @param {string} txHash
   * @returns {Promise<number>}
   */
  async getTransactionConfirmations(txHash) {
    try {
      const resp = await axios.get(`${this.baseUrl}/txs/${txHash}`, {
        params: this._tokenParams(),
        timeout: 10000,
      });
      return resp.data.confirmations || 0;
    } catch (error) {
      console.error(`Erreur getTransactionConfirmations BTC pour ${txHash}:`, error.message);
      return 0;
    }
  }
}

module.exports = new BtcService();
