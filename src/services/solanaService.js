const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const config = require('../config');

class SolanaService {
  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
  }

  /**
   * Génère un nouveau wallet Solana
   * @returns {{ address: string, privateKey: string }}
   */
  generateWallet() {
    const keypair = Keypair.generate();
    return {
      address: keypair.publicKey.toString(),
      // Stockage en hex (64 octets = 128 chars hex)
      privateKey: Buffer.from(keypair.secretKey).toString('hex'),
    };
  }

  /**
   * Solde SOL d'une adresse
   * @param {string} address
   * @returns {Promise<number>} Solde en SOL
   */
  async getBalance(address) {
    try {
      const pubkey = new PublicKey(address);
      const balance = await this.connection.getBalance(pubkey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error(`Erreur getBalance SOL pour ${address}:`, error.message);
      return 0;
    }
  }

  /**
   * Transactions SOL entrantes sur une adresse
   * @param {string} address
   * @param {number} sinceTimestamp - Timestamp en ms (utilisé pour filtrer les anciennes tx)
   * @returns {Promise<Array<{ txHash, amount, confirmations, timestamp }>>}
   */
  async getIncomingTransactions(address, sinceTimestamp = 0) {
    try {
      const pubkey = new PublicKey(address);
      const signatures = await this.connection.getSignaturesForAddress(pubkey, { limit: 20 });

      const results = [];
      for (const sig of signatures) {
        if (sig.err) continue;

        // Filtrer par timestamp si fourni
        if (sinceTimestamp > 0 && sig.blockTime) {
          const txTimestampMs = sig.blockTime * 1000;
          if (txTimestampMs < sinceTimestamp - 120000) continue; // 2 min de marge
        }

        try {
          const tx = await this.connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });
          if (!tx || !tx.meta) continue;

          const accountKeys = tx.transaction.message.getAccountKeys
            ? tx.transaction.message.getAccountKeys().staticAccountKeys
            : tx.transaction.message.accountKeys;

          const accountIndex = accountKeys.findIndex(
            key => key.toString() === address
          );
          if (accountIndex === -1) continue;

          const preBalance = tx.meta.preBalances[accountIndex] || 0;
          const postBalance = tx.meta.postBalances[accountIndex] || 0;
          const diff = postBalance - preBalance;

          if (diff > 0) {
            results.push({
              txHash: sig.signature,
              amount: diff / LAMPORTS_PER_SOL,
              confirmations: sig.confirmationStatus === 'finalized' ? 1 : 0,
              timestamp: (sig.blockTime || 0) * 1000,
            });
          }
        } catch (_) {
          // Ignore les erreurs sur une tx individuelle
        }
      }

      return results;
    } catch (error) {
      console.error(`Erreur getIncomingTransactions SOL pour ${address}:`, error.message);
      return [];
    }
  }

  /**
   * Vérifie si une transaction est confirmée (finalized)
   * @param {string} signature
   * @returns {Promise<number>} 1 si finalisée, 0 sinon
   */
  async getTransactionConfirmations(signature) {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      if (!status.value) return 0;
      return status.value.confirmationStatus === 'finalized' ? 1 : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Sweep tous les SOL d'un wallet vers le wallet central.
   * Les frais réseau sont déduits du montant net (~5000 lamports par tx).
   *
   * @param {string} privateKeyHex - Clé privée hex (128 chars)
   * @param {string} fromAddress - Adresse source
   * @param {string} toAddress - Wallet central de destination
   * @param {string|null} feesWalletAddress - Wallet de frais (null = aucun frais)
   * @param {number} feesPercentage - Ex: 0.03 pour 3%
   * @returns {Promise<{ txHash: string, feesAmount: number }>}
   */
  async sweepSOL(privateKeyHex, fromAddress, toAddress, feesWalletAddress, feesPercentage) {
    try {
      const secretKey = Buffer.from(privateKeyHex, 'hex');
      const keypair = Keypair.fromSecretKey(secretKey);

      const balance = await this.connection.getBalance(keypair.publicKey);
      if (balance === 0) {
        throw new Error(`Solde SOL nul pour ${fromAddress}`);
      }

      // ~5000 lamports de frais réseau par transaction
      const networkFeePerTx = 5000;
      const withFees = feesPercentage > 0 && feesWalletAddress;
      const numTxs = withFees ? 2 : 1;
      const totalNetworkFees = networkFeePerTx * numTxs;

      const available = balance - totalNetworkFees;
      if (available <= 0) {
        throw new Error(
          `Solde SOL insuffisant pour couvrir les frais réseau (solde: ${balance / LAMPORTS_PER_SOL} SOL)`
        );
      }

      let txHash;
      let feesAmount = 0;

      if (withFees) {
        const feeAmountLamports = Math.floor(available * feesPercentage);
        const netAmountLamports = available - feeAmountLamports;

        console.log(
          `💰 Frais SOL: ${feeAmountLamports / LAMPORTS_PER_SOL} SOL (${feesPercentage * 100}%) → ${feesWalletAddress}`
        );

        // 1. Envoyer les frais
        const { blockhash: blockhash1 } = await this.connection.getLatestBlockhash();
        const feeTx = new Transaction({
          recentBlockhash: blockhash1,
          feePayer: keypair.publicKey,
        });
        feeTx.add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: new PublicKey(feesWalletAddress),
            lamports: feeAmountLamports,
          })
        );
        feeTx.sign(keypair);
        const feeSig = await this.connection.sendRawTransaction(feeTx.serialize());
        console.log(`⛽ Fees SOL tx: ${feeSig}`);
        feesAmount = feeAmountLamports / LAMPORTS_PER_SOL;

        await this._sleep(2000);

        // 2. Envoyer le net
        const { blockhash: blockhash2 } = await this.connection.getLatestBlockhash();
        const mainTx = new Transaction({
          recentBlockhash: blockhash2,
          feePayer: keypair.publicKey,
        });
        mainTx.add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: new PublicKey(toAddress),
            lamports: netAmountLamports,
          })
        );
        mainTx.sign(keypair);
        txHash = await this.connection.sendRawTransaction(mainTx.serialize());
      } else {
        const { blockhash } = await this.connection.getLatestBlockhash();
        const tx = new Transaction({
          recentBlockhash: blockhash,
          feePayer: keypair.publicKey,
        });
        tx.add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: new PublicKey(toAddress),
            lamports: available,
          })
        );
        tx.sign(keypair);
        txHash = await this.connection.sendRawTransaction(tx.serialize());
      }

      console.log(`💸 Sweep SOL: ${fromAddress} → ${toAddress} (tx: ${txHash})`);
      return { txHash, feesAmount };
    } catch (error) {
      console.error(`Erreur sweepSOL depuis ${fromAddress}:`, error.message);
      throw error;
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new SolanaService();
