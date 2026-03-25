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
    try {
      const url = `${config.tron.fullHost}/v1/accounts/${address}/transactions/trc20`;
      const params = {
        only_to: true,
        limit: 50,
        contract_address: this.usdtContract,
      };
      if (sinceTimestamp > 0) {
        params.min_timestamp = sinceTimestamp;
      }

      const response = await this.tronWeb.fullNode.request(
        `/v1/accounts/${address}/transactions/trc20`,
        params,
        'get'
      );

      if (!response || !response.data) return [];

      return response.data
        .filter((tx) => tx.to === address && tx.token_info?.address === this.usdtContract)
        .map((tx) => {
          // tx.from peut être en hex (41...) ou base58 (T...) selon la version TronGrid
          let from = tx.from;
          if (from && from.startsWith('41')) {
            try { from = TronWeb.address.fromHex(from); } catch (_) {}
          }
          return {
            txHash: tx.transaction_id,
            from,
            to: tx.to,
            amount: Number(tx.value) / 1e6,
            timestamp: tx.block_timestamp,
            confirmed: tx.confirmed ?? true,
          };
        });
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
   * Sweep : transfère les USDT d'un wallet généré vers le wallet central
   * @param {string} fromPrivateKey - Clé privée du wallet source
   * @param {string} fromAddress - Adresse source
   * @param {number} amount - Montant USDT à transférer
   * @returns {string} Hash de la transaction
   */
  async sweepUSDT(fromPrivateKey, fromAddress, amount) {
    try {
      // 1. Vérifier le solde TRX pour le gas
      const trxBalance = await this.getTRXBalance(fromAddress);
      if (trxBalance < config.sweep.minTrxForGas / 1e6) {
        console.log(`⛽ Envoi de TRX pour gas à ${fromAddress}...`);
        await this.sendTRXForGas(fromAddress, config.sweep.minTrxForGas);
        // Attendre la confirmation
        await this._sleep(5000);
      }

      // 2. Créer l'instance TronWeb avec la clé du wallet source
      const tronWebSrc = new TronWeb({
        fullHost: config.tron.fullHost,
        privateKey: fromPrivateKey,
        headers: config.tron.apiKey ? { 'TRON-PRO-API-KEY': config.tron.apiKey } : {},
      });

      // 3. Appeler transfer sur le contrat USDT
      const contract = await tronWebSrc.contract().at(this.usdtContract);
      const amountSun = Math.floor(amount * 1e6);

      const tx = await contract.methods
        .transfer(config.tron.centralWallet.address, amountSun)
        .send({ feeLimit: config.sweep.feeLimit });

      console.log(`💸 Sweep de ${amount} USDT de ${fromAddress} → central (tx: ${tx})`);
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
