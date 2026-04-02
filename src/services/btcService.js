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

    this.mempoolUrl = config.btc.network === 'testnet'
      ? 'https://mempool.space/testnet/api'
      : 'https://mempool.space/api';

    // Cache du fee rate (valide 10 minutes)
    this._feeCache = null;
    this._feeCacheAt = 0;
  }

  _tokenParams() {
    return config.btc.blockcypherToken
      ? { token: config.btc.blockcypherToken }
      : {};
  }

  _is429(error) {
    return error?.response?.status === 429;
  }

  /**
   * Wrapper axios GET avec retry automatique sur 429 (backoff: 2s, 4s, 8s)
   */
  async _get(url, options = {}) {
    const delays = [2000, 4000, 8000];
    for (let i = 0; ; i++) {
      try {
        return await axios.get(url, options);
      } catch (error) {
        if (this._is429(error) && i < delays.length) {
          await new Promise(r => setTimeout(r, delays[i]));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Wrapper axios POST avec retry automatique sur 429 (backoff: 2s, 4s, 8s)
   */
  async _post(url, data, options = {}) {
    const delays = [2000, 4000, 8000];
    for (let i = 0; ; i++) {
      try {
        return await axios.post(url, data, options);
      } catch (error) {
        if (this._is429(error) && i < delays.length) {
          await new Promise(r => setTimeout(r, delays[i]));
          continue;
        }
        throw error;
      }
    }
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
   * Solde et transactions BTC — BlockCypher avec fallback mempool.space
   * @param {string} address
   * @returns {Promise<{ balance: number, txs: Array<{ txHash, amount, confirmations, timestamp }> }>}
   */
  async getAddressInfo(address) {
    // Tentative BlockCypher
    try {
      const resp = await this._get(`${this.baseUrl}/addrs/${address}`, {
        params: this._tokenParams(),
        timeout: 10000,
      });
      const data = resp.data;
      const txrefs = data.txrefs || [];
      const txs = txrefs
        .filter(tx => !tx.spent && tx.tx_output_n >= 0)
        .map(tx => ({
          txHash: tx.tx_hash,
          amount: tx.value / 1e8,
          confirmations: tx.confirmations || 0,
          timestamp: tx.confirmed ? new Date(tx.confirmed).getTime() : Date.now(),
        }));
      return { balance: (data.balance || 0) / 1e8, txs };
    } catch (error) {
      if (!this._is429(error)) {
        console.error(`Erreur getBalance BTC pour ${address}:`, error.message);
        return { balance: 0, txs: [] };
      }
    }

    // Fallback mempool.space
    try {
      console.warn(`⚠️ BlockCypher 429 — fallback mempool.space pour ${address}`);
      const [addrResp, utxoResp] = await Promise.all([
        axios.get(`${this.mempoolUrl}/address/${address}`, { timeout: 10000 }),
        axios.get(`${this.mempoolUrl}/address/${address}/utxo`, { timeout: 10000 }),
      ]);
      const stats = addrResp.data.chain_stats;
      const balance = (stats.funded_txo_sum - stats.spent_txo_sum) / 1e8;
      const txs = (utxoResp.data || []).map(u => ({
        txHash: u.txid,
        amount: u.value / 1e8,
        confirmations: u.status.confirmed ? 1 : 0,
        timestamp: u.status.block_time ? u.status.block_time * 1000 : Date.now(),
      }));
      return { balance, txs };
    } catch (error) {
      console.error(`Erreur getBalance BTC (mempool fallback) pour ${address}:`, error.message);
      return { balance: 0, txs: [] };
    }
  }

  /**
   * Solde BTC confirmé
   * @param {string} address
   * @returns {Promise<number>} Solde en BTC
   */
  async getBalance(address) {
    const { balance } = await this.getAddressInfo(address);
    return balance;
  }

  /**
   * Transactions BTC reçues (non dépensées) sur une adresse
   * @param {string} address
   * @param {number} _sinceTimestamp - Ignoré. Présent pour compatibilité d'interface avec tronService.
   * @returns {Promise<Array<{ txHash, amount, confirmations, timestamp }>>}
   */
  async getIncomingTransactions(address, _sinceTimestamp) {
    const { txs } = await this.getAddressInfo(address);
    return txs;
  }

  /**
   * Nombre de confirmations d'une transaction BTC — BlockCypher avec fallback mempool.space
   * @param {string} txHash
   * @returns {Promise<number>}
   */
  async getTransactionConfirmations(txHash) {
    // Tentative BlockCypher
    try {
      const resp = await this._get(`${this.baseUrl}/txs/${txHash}`, {
        params: this._tokenParams(),
        timeout: 10000,
      });
      return resp.data.confirmations || 0;
    } catch (error) {
      if (!this._is429(error)) {
        console.error(`Erreur getTransactionConfirmations BTC pour ${txHash}:`, error.message);
        return 0;
      }
    }

    // Fallback mempool.space
    try {
      console.warn(`⚠️ BlockCypher 429 — fallback mempool.space pour tx ${txHash}`);
      const [txResp, tipResp] = await Promise.all([
        axios.get(`${this.mempoolUrl}/tx/${txHash}`, { timeout: 10000 }),
        axios.get(`${this.mempoolUrl}/blocks/tip/height`, { timeout: 10000 }),
      ]);
      if (!txResp.data.status.confirmed) return 0;
      return (tipResp.data - txResp.data.status.block_height) + 1;
    } catch (error) {
      console.error(`Erreur getTransactionConfirmations (mempool fallback) pour ${txHash}:`, error.message);
      return 0;
    }
  }

  /**
   * Sweep tous les UTXOs confirmés d'une adresse vers le wallet central.
   * Les frais réseau sont déduits du montant net (pas des fees).
   * Si feesPercentage > 0 et feesWalletAddress fourni : 2 outputs dans la même tx.
   * Chaque étape tente BlockCypher d'abord, puis bascule sur mempool.space en cas de 429.
   *
   * @param {string} privateKeyWIF - Clé privée WIF du wallet source
   * @param {string} fromAddress - Adresse source (bc1q...)
   * @param {string} toAddress - Wallet central de destination
   * @param {string|null} feesWalletAddress - Wallet de frais (null = aucun frais)
   * @param {number} feesPercentage - Ex: 0.03 pour 3% (0 = aucun frais)
   * @returns {Promise<{ txHash: string, feesAmount: number }>}
   */
  async sweepBTC(privateKeyWIF, fromAddress, toAddress, feesWalletAddress, feesPercentage) {
    try {
      const tokenParams = this._tokenParams();

      // 1. UTXOs confirmés
      let utxos;
      try {
        const utxoResp = await this._get(`${this.baseUrl}/addrs/${fromAddress}`, {
          params: { ...tokenParams, unspentOnly: true },
          timeout: 10000,
        });
        utxos = (utxoResp.data.txrefs || []).filter(u => !u.spent).map(u => ({
          tx_hash: u.tx_hash,
          tx_output_n: u.tx_output_n,
          value: u.value,
        }));
      } catch (error) {
        if (!this._is429(error)) throw error;
        console.warn(`⚠️ BlockCypher 429 (UTXOs) — fallback mempool.space pour ${fromAddress}`);
        const utxoResp = await axios.get(`${this.mempoolUrl}/address/${fromAddress}/utxo`, { timeout: 10000 });
        utxos = (utxoResp.data || [])
          .filter(u => u.status.confirmed)
          .map(u => ({ tx_hash: u.txid, tx_output_n: u.vout, value: u.value }));
      }

      if (utxos.length === 0) {
        throw new Error(`Aucun UTXO disponible pour ${fromAddress}`);
      }

      // 2. Fee rate (sat/kb) — caché 10 minutes
      const now = Date.now();
      if (!this._feeCache || now - this._feeCacheAt > 10 * 60 * 1000) {
        try {
          const chainResp = await this._get(this.baseUrl, { params: tokenParams, timeout: 10000 });
          this._feeCache = chainResp.data.medium_fee_per_kb || 10000;
        } catch (error) {
          if (!this._is429(error)) throw error;
          console.warn(`⚠️ BlockCypher 429 (fee rate) — fallback mempool.space`);
          const feeResp = await axios.get(`${this.mempoolUrl}/v1/fees/recommended`, { timeout: 10000 });
          // mempool retourne sat/vbyte → convertir en sat/kb
          this._feeCache = (feeResp.data.halfHourFee || 10) * 1000;
        }
        this._feeCacheAt = now;
      }
      const feePerKb = this._feeCache;

      // 3. Taille estimée de la tx (vbytes)
      // P2WPKH : ~68 vbytes/input, ~31 vbytes/output, 11 vbytes overhead
      const withFees = feesPercentage > 0 && feesWalletAddress;
      const numOutputs = withFees ? 2 : 1;
      const estimatedVbytes = 11 + utxos.length * 68 + numOutputs * 31;
      const networkFeesSats = Math.ceil((estimatedVbytes / 1000) * feePerKb);

      // 4. Montants en satoshis
      const totalSats = utxos.reduce((sum, u) => sum + u.value, 0);
      const feesSats = withFees ? Math.floor(totalSats * feesPercentage) : 0;
      const netSats = totalSats - feesSats - networkFeesSats;

      if (netSats <= 546) {
        throw new Error(
          `Solde insuffisant pour couvrir les frais réseau (net: ${netSats} sats, minimum: 546 sats)`
        );
      }

      // 5. Construire la PSBT
      const keyPair = ECPair.fromWIF(privateKeyWIF, this.network);
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network: this.network,
      });

      const psbt = new bitcoin.Psbt({ network: this.network });

      for (const utxo of utxos) {
        // tx_hash est big-endian (BlockCypher + mempool) ; PSBT requiert little-endian
        const hashBuf = Buffer.from(utxo.tx_hash, 'hex').reverse();
        psbt.addInput({
          hash: hashBuf,
          index: utxo.tx_output_n,
          witnessUtxo: {
            script: p2wpkh.output,
            value: BigInt(utxo.value),
          },
        });
      }

      if (feesSats > 0) {
        psbt.addOutput({ address: feesWalletAddress, value: BigInt(feesSats) });
      }
      psbt.addOutput({ address: toAddress, value: BigInt(netSats) });

      psbt.signAllInputs(keyPair);
      psbt.finalizeAllInputs();
      const txHex = psbt.extractTransaction().toHex();

      // 6. Broadcast
      let txHash;
      try {
        const broadcastResp = await this._post(
          `${this.baseUrl}/txs/push`,
          { tx: txHex },
          { params: tokenParams, timeout: 15000 }
        );
        if (!broadcastResp.data?.tx?.hash) {
          throw new Error(`Broadcast BTC échoué — réponse inattendue: ${JSON.stringify(broadcastResp.data)}`);
        }
        txHash = broadcastResp.data.tx.hash;
      } catch (error) {
        if (!this._is429(error)) throw error;
        console.warn(`⚠️ BlockCypher 429 (broadcast) — fallback mempool.space`);
        const broadcastResp = await axios.post(
          `${this.mempoolUrl}/tx`,
          txHex,
          { headers: { 'Content-Type': 'text/plain' }, timeout: 15000 }
        );
        txHash = broadcastResp.data;
      }

      console.log(`BTC Sweep: ${fromAddress} -> ${toAddress} (tx: ${txHash})`);
      return { txHash, feesAmount: feesSats / 1e8 };

    } catch (error) {
      const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      console.error(`Erreur sweepBTC pour ${fromAddress}:`, detail);
      throw error;
    }
  }
}

module.exports = new BtcService();
