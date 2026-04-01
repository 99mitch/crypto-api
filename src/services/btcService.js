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
   * Solde et transactions BTC en un seul appel Blockcypher
   * @param {string} address
   * @returns {Promise<{ balance: number, txs: Array<{ txHash, amount, confirmations, timestamp }> }>}
   */
  async getAddressInfo(address) {
    try {
      const resp = await axios.get(`${this.baseUrl}/addrs/${address}`, {
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
      console.error(`Erreur getBalance BTC pour ${address}:`, error.message);
      return { balance: 0, txs: [] };
    }
  }

  /**
   * Solde BTC confirmé via Blockcypher
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
   * @param {number} _sinceTimestamp - Ignoré (Blockcypher ne supporte pas le filtre par date). Présent pour compatibilité d'interface avec tronService.
   * @returns {Promise<Array<{ txHash, amount, confirmations, timestamp }>>}
   */
  async getIncomingTransactions(address, _sinceTimestamp) {
    const { txs } = await this.getAddressInfo(address);
    return txs;
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

  /**
   * Sweep tous les UTXOs confirmés d'une adresse vers le wallet central.
   * Les frais réseau sont déduits du montant net (pas des fees).
   * Si feesPercentage > 0 et feesWalletAddress fourni : 2 outputs dans la même tx.
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
    const utxoResp = await axios.get(`${this.baseUrl}/addrs/${fromAddress}`, {
      params: { ...tokenParams, unspentOnly: true },
      timeout: 10000,
    });
    const utxos = (utxoResp.data.txrefs || []).filter(u => !u.spent);
    if (utxos.length === 0) {
      throw new Error(`Aucun UTXO disponible pour ${fromAddress}`);
    }

    // 2. Fee rate (sat/kb)
    const chainResp = await axios.get(this.baseUrl, {
      params: tokenParams,
      timeout: 10000,
    });
    const feePerKb = chainResp.data.medium_fee_per_kb || 10000;

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
      // tx_hash from Blockcypher is big-endian hex; PSBT requires little-endian (internal byte order)
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
    const broadcastResp = await axios.post(
      `${this.baseUrl}/txs/push`,
      { tx: txHex },
      { params: tokenParams, timeout: 15000 }
    );

    if (!broadcastResp.data?.tx?.hash) {
      throw new Error(`Broadcast BTC échoué — réponse inattendue: ${JSON.stringify(broadcastResp.data)}`);
    }
    const txHash = broadcastResp.data.tx.hash;
    console.log(`BTC Sweep: ${fromAddress} -> ${toAddress} (tx: ${txHash})`);

    return {
      txHash,
      feesAmount: feesSats / 1e8,
    };
    } catch (error) {
      console.error(`Erreur sweepBTC pour ${fromAddress}:`, error.message);
      throw error;
    }
  }
}

module.exports = new BtcService();
