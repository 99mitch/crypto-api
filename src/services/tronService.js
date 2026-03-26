const { TronWeb } = require('tronweb');
const config = require('../config');

class TronService {
  constructor() {
    this.tronWeb = new TronWeb({
      fullHost: config.tron.fullHost,
      headers: config.tron.apiKey ? { 'TRON-PRO-API-KEY': config.tron.apiKey } : {},
    });

    this.usdtContract = config.tron.usdtContract;
  }

  /**
   * Génère un nouveau wallet Tron
   * @returns {{ address: string, privateKey: string, base58: string }}
   */
  async generateWallet() {
    const account = await this.tronWeb.createAccount();
    return {
      address: account.address.base58,
      privateKey: account.privateKey,
      base58: account.address.base58,
    };
  }

  /**
   * Récupère le solde USDT TRC-20 d'une adresse
   * @param {string} address - Adresse Tron base58
   * @returns {number} Solde en USDT (6 décimales)
   */
  async getUSDTBalance(address) {
    try {
      this.tronWeb.setAddress(address);
      const contract = await this.tronWeb.contract().at(this.usdtContract);
      const balance = await contract.methods.balanceOf(address).call();
      // USDT a 6 décimales sur TRC-20
      return Number(balance) / 1e6;
    } catch (error) {
      console.error(`Erreur getUSDTBalance pour ${address}:`, error.message);
      return 0;
    }
  }

  /**
   * Récupère le solde TRX d'une adresse (pour le gas)
   * @param {string} address
   * @returns {number} Solde en TRX
   */
  async getTRXBalance(address) {
    try {
      const balance = await this.tronWeb.trx.getBalance(address);
      return balance / 1e6; // SUN -> TRX
    } catch (error) {
      console.error(`Erreur getTRXBalance pour ${address}:`, error.message);
      return 0;
    }
  }

  /**
   * Vérifie les transactions USDT entrantes sur une adresse via TronGrid API
   * @param {string} address - Adresse du wallet
   * @param {number} sinceTimestamp - Timestamp en ms
   * @returns {Array} Liste des transactions TRC-20
   */
  async getIncomingUSDTTransactions(address, sinceTimestamp = 0) {
    const _fetch = async (withTimestamp) => {
      const params = {
        only_to: true,
        limit: 50,
        contract_address: this.usdtContract,
      };
      // Recule de 2 min pour absorber les décalages d'horloge TronGrid
      if (withTimestamp && sinceTimestamp > 0) {
        params.min_timestamp = sinceTimestamp - 120000;
      }

      const response = await this.tronWeb.fullNode.request(
        `/v1/accounts/${address}/transactions/trc20`,
        params,
        'get'
      );

      if (!response?.data?.length) return [];

      return response.data.map((tx) => {
        let from = tx.from;
        if (from?.startsWith('41')) {
          try { from = TronWeb.address.fromHex(from); } catch (_) {}
        }
        let to = tx.to;
        if (to?.startsWith('41')) {
          try { to = TronWeb.address.fromHex(to); } catch (_) {}
        }
        return {
          txHash: tx.transaction_id,
          from,
          to,
          amount: Number(tx.value) / 1e6,
          timestamp: tx.block_timestamp,
          confirmed: tx.confirmed ?? true,
        };
      }).filter((tx) => tx.to === address);
    };

    try {
      // 1er essai avec filtre timestamp
      let txs = await _fetch(true);

      // Fallback sans timestamp si rien trouvé (délai TronGrid)
      if (!txs.length && sinceTimestamp > 0) {
        console.log(`⚠️ Aucune tx trouvée avec timestamp pour ${address}, retry sans filtre...`);
        txs = await _fetch(false);
      }

      return txs;
    } catch (error) {
      console.error(`Erreur getIncomingUSDTTransactions pour ${address}:`, error.message);
      return [];
    }
  }

  /**
   * Envoie du TRX pour couvrir les frais de gas du sweep
   * @param {string} toAddress - Adresse de destination
   * @param {number} amountSun - Montant en SUN
   * @returns {string} Hash de la transaction
   */
  async sendTRXForGas(toAddress, amountSun) {
    try {
      this.tronWeb.setPrivateKey(config.tron.centralWallet.privateKey);
      const tx = await this.tronWeb.trx.sendTransaction(toAddress, amountSun);
      if (!tx.result) {
        throw new Error('Transaction TRX échouée');
      }
      console.log(`⛽ ${amountSun / 1e6} TRX envoyé à ${toAddress} pour gas (tx: ${tx.txid})`);
      return tx.txid;
    } catch (error) {
      console.error('Erreur sendTRXForGas:', error.message);
      throw error;
    }
  }

  /**
   * Prépare le gas TRX pour couvrir N transferts depuis un wallet
   * @param {string} fromAddress
   * @param {number} nbTransfers - Nombre de transferts prévus (pour estimer le gas)
   */
  async ensureGasForSweep(fromAddress, nbTransfers = 1) {
    const trxBalance = await this.getTRXBalance(fromAddress);
    const required = (config.sweep.minTrxForGas * nbTransfers) / 1e6;
    if (trxBalance < required) {
      console.log(`⛽ Envoi de TRX pour gas à ${fromAddress}...`);
      await this.sendTRXForGas(fromAddress, config.sweep.minTrxForGas * nbTransfers);
      await this._sleep(5000);
    }
  }

  /**
   * Transfert USDT depuis un wallet vers une destination
   * @param {string} fromPrivateKey - Clé privée du wallet source
   * @param {string} fromAddress - Adresse source
   * @param {number} amount - Montant USDT à transférer
   * @param {string} toAddress - Adresse de destination
   * @returns {string} Hash de la transaction
   */
  async sweepUSDT(fromPrivateKey, fromAddress, amount, toAddress) {
    try {
      const destination = toAddress || config.tron.centralWallet.address;

      const tronWebSrc = new TronWeb({
        fullHost: config.tron.fullHost,
        privateKey: fromPrivateKey,
        headers: config.tron.apiKey ? { 'TRON-PRO-API-KEY': config.tron.apiKey } : {},
      });

      const contract = await tronWebSrc.contract().at(this.usdtContract);
      const amountSun = Math.floor(amount * 1e6);

      const tx = await contract.methods
        .transfer(destination, amountSun)
        .send({ feeLimit: config.sweep.feeLimit });

      console.log(`💸 Sweep de ${amount} USDT de ${fromAddress} → ${destination} (tx: ${tx})`);
      return tx;
    } catch (error) {
      console.error(`Erreur sweepUSDT depuis ${fromAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Vérifie si une transaction est confirmée
   * @param {string} txHash
   * @returns {{ confirmed: boolean, confirmations: number }}
   */
  async getTransactionStatus(txHash) {
    try {
      const tx = await this.tronWeb.trx.getTransactionInfo(txHash);
      if (!tx || !tx.id) {
        return { confirmed: false, confirmations: 0 };
      }
      return {
        confirmed: tx.receipt?.result === 'SUCCESS',
        confirmations: tx.blockNumber ? 1 : 0,
        blockNumber: tx.blockNumber,
      };
    } catch (error) {
      return { confirmed: false, confirmations: 0 };
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new TronService();
