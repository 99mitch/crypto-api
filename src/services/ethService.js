const { ethers } = require('ethers');
const axios = require('axios');
const config = require('../config');

class EthService {
  constructor() {
    this._provider = null;
  }

  /**
   * Retourne le provider (lazy init pour éviter une erreur si RPC non configuré)
   */
  _getProvider() {
    if (!this._provider) {
      const rpcUrl = config.eth.rpcUrl;
      if (!rpcUrl) throw new Error('ETH_RPC_URL non configuré');
      this._provider = new ethers.JsonRpcProvider(rpcUrl);
    }
    return this._provider;
  }

  /**
   * Génère un wallet ETH aléatoire
   * @returns {{ address: string, privateKey: string }}
   */
  generateWallet() {
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey, // 0x + 64 hex chars
    };
  }

  /**
   * Solde ETH d'une adresse via Etherscan
   * @param {string} address
   * @returns {Promise<number>} Solde en ETH
   */
  async getBalance(address) {
    try {
      const provider = this._getProvider();
      const balanceWei = await provider.getBalance(address);
      return parseFloat(ethers.formatEther(balanceWei));
    } catch (error) {
      console.error(`Erreur getBalance ETH pour ${address}:`, error.message);
      return 0;
    }
  }

  /**
   * Transactions ETH entrantes via Etherscan
   * @param {string} address
   * @param {number} sinceTimestamp - Timestamp ms
   * @returns {Promise<Array<{ txHash, amount, confirmations, from, timestamp }>>}
   */
  async getIncomingTransactions(address, sinceTimestamp) {
    try {
      const apiKey = config.eth.etherscanApiKey;
      const baseUrl = 'https://api.etherscan.io/v2/api';
      const params = {
        chainid: 1,
        module: 'account',
        action: 'txlist',
        address,
        sort: 'desc',
        ...(apiKey && { apikey: apiKey }),
      };

      const resp = await axios.get(baseUrl, { params, timeout: 10000 });
      if (resp.data.status !== '1' || !Array.isArray(resp.data.result)) return [];

      const sinceMs = sinceTimestamp || 0;
      return resp.data.result
        .filter(tx =>
          tx.to && tx.to.toLowerCase() === address.toLowerCase() &&
          tx.isError === '0' &&
          BigInt(tx.value) > 0n &&
          parseInt(tx.timeStamp) * 1000 >= sinceMs
        )
        .map(tx => ({
          txHash: tx.hash,
          amount: parseFloat(ethers.formatEther(tx.value)),
          confirmations: parseInt(tx.confirmations) || 0,
          from: tx.from,
          timestamp: parseInt(tx.timeStamp) * 1000,
        }));
    } catch (error) {
      console.error(`Erreur getIncomingTransactions ETH pour ${address}:`, error.message);
      return [];
    }
  }

  /**
   * Nombre de confirmations d'une transaction ETH
   * @param {string} txHash
   * @returns {Promise<number>}
   */
  async getTransactionConfirmations(txHash) {
    try {
      const provider = this._getProvider();
      const [tx, currentBlock] = await Promise.all([
        provider.getTransaction(txHash),
        provider.getBlockNumber(),
      ]);
      if (!tx || !tx.blockNumber) return 0;
      return currentBlock - tx.blockNumber + 1;
    } catch (error) {
      console.error(`Erreur getTransactionConfirmations ETH pour ${txHash}:`, error.message);
      return 0;
    }
  }

  /**
   * Sweep ETH d'un wallet dédié vers le wallet central.
   * Les frais réseau sont déduits du solde disponible.
   *
   * @param {string} privateKey - Clé privée 0x...
   * @param {string} fromAddress - Adresse source
   * @param {string} toAddress - Wallet central
   * @param {string|null} feesWalletAddress - Wallet de frais (null = aucun)
   * @param {number} feesPercentage - Ex: 0.03 pour 3%
   * @returns {Promise<{ txHash: string, feesTxHash: string|null, feesAmount: number|null }>}
   */
  async sweepETH(privateKey, fromAddress, toAddress, feesWalletAddress, feesPercentage) {
    const provider = this._getProvider();
    const wallet = new ethers.Wallet(privateKey, provider);

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
    const gasLimit = 21000n;
    const gasCostWei = gasPrice * gasLimit;

    const hasFees = feesPercentage > 0 && feesWalletAddress;
    const numTxs = hasFees ? 2n : 1n;

    const balanceWei = await provider.getBalance(fromAddress);
    const reservedGasWei = gasCostWei * numTxs;
    const available = balanceWei - reservedGasWei;

    if (available <= 0n) {
      throw new Error(`Solde ETH insuffisant pour couvrir les frais réseau (balance: ${ethers.formatEther(balanceWei)} ETH)`);
    }

    // Calcul des frais de plateforme en wei (integer safe)
    const feesBps = BigInt(Math.round(feesPercentage * 10000));
    const feesWei = hasFees ? (available * feesBps) / 10000n : 0n;
    const netWei = available - feesWei;

    let feesTxHash = null;
    let feesAmount = null;

    if (hasFees && feesWei > 0n) {
      console.log(`💰 ETH frais: ${ethers.formatEther(feesWei)} ETH (${feesPercentage * 100}%) → ${feesWalletAddress}`);
      const tx1 = await wallet.sendTransaction({
        to: feesWalletAddress,
        value: feesWei,
        gasPrice,
        gasLimit,
      });
      await tx1.wait(1);
      feesTxHash = tx1.hash;
      feesAmount = parseFloat(ethers.formatEther(feesWei));
    }

    const tx2 = await wallet.sendTransaction({
      to: toAddress,
      value: netWei,
      gasPrice,
      gasLimit,
    });

    console.log(`ETH Sweep: ${fromAddress} -> ${toAddress} (tx: ${tx2.hash})`);
    return {
      txHash: tx2.hash,
      feesTxHash,
      feesAmount,
    };
  }
}

module.exports = new EthService();
