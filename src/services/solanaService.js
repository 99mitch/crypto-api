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
    this._connection = null;
  }

  /**
   * Retourne la connexion RPC (lazy init)
   */
  _getConnection() {
    if (!this._connection) {
      const rpcUrl = config.solana.rpcUrl || 'https://api.mainnet-beta.solana.com';
      this._connection = new Connection(rpcUrl, 'confirmed');
    }
    return this._connection;
  }

  /**
   * Génère un nouveau wallet Solana
   * @returns {{ address: string, privateKey: string }} privateKey = hex du secret key (64 bytes)
   */
  generateWallet() {
    const keypair = Keypair.generate();
    return {
      address: keypair.publicKey.toBase58(),
      privateKey: Buffer.from(keypair.secretKey).toString('hex'), // 128 hex chars
    };
  }

  /**
   * Recrée un Keypair depuis la clé privée hex
   * @param {string} privateKeyHex
   * @returns {Keypair}
   */
  _keypairFromHex(privateKeyHex) {
    return Keypair.fromSecretKey(Buffer.from(privateKeyHex, 'hex'));
  }

  /**
   * Solde SOL d'une adresse
   * @param {string} address
   * @returns {Promise<number>} Solde en SOL
   */
  async getBalance(address) {
    try {
      const connection = this._getConnection();
      const pubkey = new PublicKey(address);
      const lamports = await connection.getBalance(pubkey);
      return lamports / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error(`Erreur getBalance SOL pour ${address}:`, error.message);
      return 0;
    }
  }

  /**
   * Transactions SOL entrantes sur une adresse
   * @param {string} address
   * @param {number} sinceTimestamp - Timestamp ms
   * @returns {Promise<Array<{ txHash, amount, confirmations, from, timestamp }>>}
   */
  async getIncomingTransactions(address, sinceTimestamp) {
    try {
      const connection = this._getConnection();
      const pubkey = new PublicKey(address);

      const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 20 });
      const sinceMs = sinceTimestamp || 0;

      const transactions = [];
      for (const sig of sigs) {
        if (sig.blockTime && sig.blockTime * 1000 < sinceMs) continue;
        if (sig.err) continue;

        const tx = await connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx || tx.meta.err) continue;

        const { preBalances, postBalances } = tx.meta;
        const accountKeys = tx.transaction.message.staticAccountKeys ||
          tx.transaction.message.accountKeys;

        const destIndex = accountKeys.findIndex(k => k.toBase58() === address);
        if (destIndex === -1) continue;

        const received = postBalances[destIndex] - preBalances[destIndex];
        if (received <= 0) continue;

        transactions.push({
          txHash: sig.signature,
          amount: received / LAMPORTS_PER_SOL,
          confirmations: 1, // Solana: 1 confirmation = transaction finalisée
          from: accountKeys[0].toBase58(),
          timestamp: sig.blockTime ? sig.blockTime * 1000 : Date.now(),
        });
      }
      return transactions;
    } catch (error) {
      console.error(`Erreur getIncomingTransactions SOL pour ${address}:`, error.message);
      return [];
    }
  }

  /**
   * Vérifie si une signature de transaction existe (confirmée)
   * @param {string} txHash - Signature Solana
   * @returns {Promise<number>} 1 si confirmée, 0 sinon
   */
  async getTransactionConfirmations(txHash) {
    try {
      const connection = this._getConnection();
      const status = await connection.getSignatureStatus(txHash);
      if (!status.value) return 0;
      return status.value.err ? 0 : 1;
    } catch (error) {
      console.error(`Erreur getTransactionConfirmations SOL pour ${txHash}:`, error.message);
      return 0;
    }
  }

  /**
   * Sweep SOL d'un wallet dédié vers le wallet central.
   * Les frais réseau sont déduits du solde.
   *
   * @param {string} privateKeyHex - Clé privée hex (128 chars)
   * @param {string} fromAddress - Adresse source
   * @param {string} toAddress - Wallet central
   * @param {string|null} feesWalletAddress - Wallet de frais (null = aucun)
   * @param {number} feesPercentage - Ex: 0.03 pour 3%
   * @returns {Promise<{ txHash: string, feesTxHash: string|null, feesAmount: number|null }>}
   */
  async sweepSOL(privateKeyHex, fromAddress, toAddress, feesWalletAddress, feesPercentage) {
    const connection = this._getConnection();
    const keypair = this._keypairFromHex(privateKeyHex);
    const fromPubkey = new PublicKey(fromAddress);

    // Frais de tx Solana : ~5000 lamports par transaction (estimation conservative)
    const TX_FEE_LAMPORTS = 5000;
    const hasFees = feesPercentage > 0 && feesWalletAddress;
    const numTxs = hasFees ? 2 : 1;
    const totalTxFees = TX_FEE_LAMPORTS * numTxs;

    const balanceLamports = await connection.getBalance(fromPubkey);
    const available = balanceLamports - totalTxFees;

    if (available <= 0) {
      throw new Error(`Solde SOL insuffisant pour couvrir les frais réseau (balance: ${balanceLamports / LAMPORTS_PER_SOL} SOL)`);
    }

    const feesLamports = hasFees ? Math.floor(available * feesPercentage) : 0;
    const netLamports = available - feesLamports;

    let feesTxHash = null;
    let feesAmount = null;

    if (hasFees && feesLamports > 0) {
      const feesPubkey = new PublicKey(feesWalletAddress);
      console.log(`💰 SOL frais: ${feesLamports / LAMPORTS_PER_SOL} SOL (${feesPercentage * 100}%) → ${feesWalletAddress}`);

      const { blockhash } = await connection.getLatestBlockhash();
      const feesTx = new Transaction({ recentBlockhash: blockhash, feePayer: fromPubkey }).add(
        SystemProgram.transfer({ fromPubkey, toPubkey: feesPubkey, lamports: feesLamports })
      );
      feesTx.sign(keypair);
      feesTxHash = await connection.sendRawTransaction(feesTx.serialize());
      await connection.confirmTransaction(feesTxHash, 'confirmed');
      feesAmount = feesLamports / LAMPORTS_PER_SOL;
    }

    const toPubkey = new PublicKey(toAddress);
    const { blockhash } = await connection.getLatestBlockhash();
    const mainTx = new Transaction({ recentBlockhash: blockhash, feePayer: fromPubkey }).add(
      SystemProgram.transfer({ fromPubkey, toPubkey, lamports: netLamports })
    );
    mainTx.sign(keypair);
    const txHash = await connection.sendRawTransaction(mainTx.serialize());
    await connection.confirmTransaction(txHash, 'confirmed');

    console.log(`SOL Sweep: ${fromAddress} -> ${toAddress} (tx: ${txHash})`);
    return { txHash, feesTxHash, feesAmount };
  }
}

module.exports = new SolanaService();
