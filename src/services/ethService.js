const { ethers } = require('ethers');
const axios = require('axios');
const config = require('../config');

class EthService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.eth.rpcUrl);
    this.etherscanApiKey = config.eth.etherscanApiKey;
    this.etherscanBaseUrl = 'https://api.etherscan.io/api';
  }

  /**
   * Génère un wallet Ethereum aléatoire
   * @returns {{ address: string, privateKey: string }}
   */
  generateWallet() {
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
    };
  }

  /**
   * Solde ETH confirmé d'une adresse
   * @param {string} address
   * @returns {Promise<number>} Solde en ETH
   */
  async getBalance(address) {
    try {
      const balance = await this.provider.getBalance(address);
      return parseFloat(ethers.formatEther(balance));
    } catch (error) {
      // Fallback Etherscan si le provider RPC est indisponible
      try {
        const resp = await axios.get(this.etherscanBaseUrl, {
          params: {
            module: 'account',
            action: 'balance',
            address,
            tag: 'latest',
            apikey: this.etherscanApiKey,
          },
          timeout: 10000,
        });
        if (resp.data.status === '1') {
          return parseFloat(ethers.formatEther(BigInt(resp.data.result)));
        }
      } catch (_) {}
      console.error(`Erreur getBalance ETH pour ${address}:`, error.message);
      return 0;
    }
  }

  /**
   * Transactions ETH entrantes sur une adresse via Etherscan
   * @param {string} address
   * @param {number} _sinceTimestamp - Présent pour compatibilité d'interface
   * @returns {Promise<Array<{ txHash, amount, confirmations, timestamp }>>}
   */
  async getIncomingTransactions(address, _sinceTimestamp) {
    try {
      const resp = await axios.get(this.etherscanBaseUrl, {
        params: {
          module: 'account',
          action: 'txlist',
          address,
          startblock: 0,
          endblock: 99999999,
          sort: 'desc',
          apikey: this.etherscanApiKey,
        },
        timeout: 10000,
      });

      if (resp.data.status !== '1' || !resp.data.result?.length) return [];

      return resp.data.result
        .filter(tx =>
          tx.to?.toLowerCase() === address.toLowerCase() &&
          tx.isError === '0' &&
          BigInt(tx.value) > 0n
        )
        .map(tx => ({
          txHash: tx.hash,
          amount: parseFloat(ethers.formatEther(BigInt(tx.value))),
          confirmations: parseInt(tx.confirmations) || 0,
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
      const [tx, currentBlock] = await Promise.all([
        this.provider.getTransaction(txHash),
        this.provider.getBlockNumber(),
      ]);
      if (!tx || !tx.blockNumber) return 0;
      return currentBlock - tx.blockNumber + 1;
    } catch (error) {
      // Fallback Etherscan
      try {
        const resp = await axios.get(this.etherscanBaseUrl, {
          params: {
            module: 'proxy',
            action: 'eth_getTransactionByHash',
            txhash: txHash,
            apikey: this.etherscanApiKey,
          },
          timeout: 10000,
        });
        if (resp.data.result?.blockNumber) {
          const blockResp = await axios.get(this.etherscanBaseUrl, {
            params: {
              module: 'proxy',
              action: 'eth_blockNumber',
              apikey: this.etherscanApiKey,
            },
            timeout: 10000,
          });
          const currentBlock = parseInt(blockResp.data.result, 16);
          const txBlock = parseInt(resp.data.result.blockNumber, 16);
          return currentBlock - txBlock + 1;
        }
      } catch (_) {}
      return 0;
    }
  }

  /**
   * Sweep tous les ETH d'un wallet vers le wallet central.
   * Les frais réseau sont déduits du montant net.
   * Si feesPercentage > 0 et feesWalletAddress fourni : 2 transactions distinctes.
   *
   * @param {string} privateKey - Clé privée hex (0x...)
   * @param {string} fromAddress - Adresse source
   * @param {string} toAddress - Wallet central de destination
   * @param {string|null} feesWalletAddress - Wallet de frais (null = aucun frais)
   * @param {number} feesPercentage - Ex: 0.03 pour 3%
   * @returns {Promise<{ txHash: string, feesAmount: number }>}
   */
  async sweepETH(privateKey, fromAddress, toAddress, feesWalletAddress, feesPercentage) {
    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      const balance = await this.provider.getBalance(fromAddress);

      if (balance === 0n) {
        throw new Error(`Solde ETH nul pour ${fromAddress}`);
      }

      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice;
      const gasLimit = 21000n;
      const networkFeePerTx = gasPrice * gasLimit;

      const withFees = feesPercentage > 0 && feesWalletAddress;
      const numTxs = withFees ? 2n : 1n;
      const totalNetworkFees = networkFeePerTx * numTxs;

      const available = balance - totalNetworkFees;
      if (available <= 0n) {
        throw new Error(
          `Solde ETH insuffisant pour couvrir les frais réseau (solde: ${ethers.formatEther(balance)} ETH)`
        );
      }

      let txHash;
      let feesAmount = 0;

      if (withFees) {
        const feeAmountWei = BigInt(Math.floor(Number(available) * feesPercentage));
        const netAmountWei = available - feeAmountWei;

        if (netAmountWei <= 0n) {
          throw new Error('Solde insuffisant après déduction des frais de plateforme');
        }

        console.log(
          `💰 Frais ETH: ${ethers.formatEther(feeAmountWei)} ETH (${feesPercentage * 100}%) → ${feesWalletAddress}`
        );

        // 1. Envoyer les frais
        const feeTx = await wallet.sendTransaction({
          to: feesWalletAddress,
          value: feeAmountWei,
          gasLimit,
          gasPrice,
        });
        console.log(`⛽ Fees ETH tx: ${feeTx.hash}`);
        await feeTx.wait(1);

        // 2. Envoyer le net
        const netTx = await wallet.sendTransaction({
          to: toAddress,
          value: netAmountWei,
          gasLimit,
          gasPrice,
        });
        txHash = netTx.hash;
        feesAmount = parseFloat(ethers.formatEther(feeAmountWei));
      } else {
        const tx = await wallet.sendTransaction({
          to: toAddress,
          value: available,
          gasLimit,
          gasPrice,
        });
        txHash = tx.hash;
      }

      console.log(`💸 Sweep ETH: ${fromAddress} → ${toAddress} (tx: ${txHash})`);
      return { txHash, feesAmount };
    } catch (error) {
      console.error(`Erreur sweepETH depuis ${fromAddress}:`, error.message);
      throw error;
    }
  }
}

module.exports = new EthService();
