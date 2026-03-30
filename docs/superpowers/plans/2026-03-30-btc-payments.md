# BTC Payments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Bitcoin (BTC) payment support to the existing `/api/payments` endpoint, with automatic USD→BTC conversion, Blockcypher monitoring, 3-confirmation requirement, and 3% sweep fees — matching the full USDT TRC-20 feature set.

**Architecture:** `btcService.js` and `priceService.js` are added alongside the existing `tronService.js`. `paymentService.js` uses a `blockchainServices` registry to dispatch by currency. `paymentMonitor.js` gains `_checkBTCPayment()` and `_sweepBTCPayment()` methods. The `Payment` model gains `currency`, `usdAmount`, `exchangeRate`, and `requiredConfirmations` fields.

**Tech Stack:** bitcoinjs-lib v6 + tiny-secp256k1 + ecpair (P2WPKH wallets, PSBT signing), Blockcypher REST API, CoinGecko + Binance public APIs (price), Jest + mongodb-memory-server (existing test infra).

---

## File Map

**Create:**
- `src/services/priceService.js` — `getBTCRate()` with 60s in-memory cache, CoinGecko primary, Binance fallback
- `src/services/btcService.js` — `generateWallet`, `getBalance`, `getIncomingTransactions`, `getTransactionConfirmations`, `sweepBTC`
- `tests/unit/priceService.test.js`
- `tests/unit/btcService.test.js`

**Modify:**
- `src/config/index.js` — add `btc` config block
- `src/models/Payment.js` — add `currency`, `usdAmount`, `exchangeRate`, `requiredConfirmations`; update `toPublicJSON`
- `src/services/qrCodeService.js` — BIP21 URI support for BTC QR codes
- `src/services/paymentService.js` — `blockchainServices` registry, BTC creation branch
- `src/jobs/paymentMonitor.js` — extract `_checkUSDTPayment`, add `_checkBTCPayment`, `_sweepUSDTPayment`, `_sweepBTCPayment`
- `src/controllers/paymentController.js` — validate `currency`, USD minimum for BTC
- `PHP_INTEGRATION.md` — BTC section

---

## Task 1: Install dependencies + config

**Files:**
- Modify: `package.json`
- Modify: `src/config/index.js`

- [ ] **Install bitcoinjs-lib and required peer dependencies**

```bash
npm install bitcoinjs-lib tiny-secp256k1 ecpair
```

Expected: packages appear in `node_modules` and `package.json` dependencies.

- [ ] **Add BTC config block to `src/config/index.js`**

Add after the `fees` block, before the `admin` block:

```js
  btc: {
    network: process.env.BTC_NETWORK || 'mainnet',
    blockcypherToken: process.env.BLOCKCYPHER_TOKEN || '',
    centralWallet: {
      address: process.env.BTC_CENTRAL_WALLET_ADDRESS,
      wif: process.env.BTC_CENTRAL_WALLET_WIF,
    },
    feesWalletAddress: process.env.BTC_FEES_WALLET_ADDRESS || null,
    payment: {
      expirationMinutes: parseInt(process.env.BTC_PAYMENT_EXPIRATION_MINUTES) || 60,
      requiredConfirmations: parseInt(process.env.BTC_REQUIRED_CONFIRMATIONS) || 3,
      amountTolerance: parseFloat(process.env.BTC_AMOUNT_TOLERANCE) || 0.015,
    },
  },
```

- [ ] **Commit**

```bash
git add package.json package-lock.json src/config/index.js
git commit -m "feat: install bitcoinjs-lib deps and add BTC config block"
```

---

## Task 2: Payment model — BTC fields

**Files:**
- Modify: `src/models/Payment.js`
- Modify: `tests/unit/models.test.js`

- [ ] **Write failing tests** — add inside the `describe('Payment Model')` block in `tests/unit/models.test.js`:

```js
describe('BTC payment fields', () => {
  it('accepte currency BTC avec usdAmount et exchangeRate', async () => {
    const payment = await Payment.create({
      ...validPayment,
      paymentId: 'PAY-BTC001',
      currency: 'BTC',
      usdAmount: 25.00,
      amount: 0.00029412,
      exchangeRate: 85000,
      requiredConfirmations: 3,
    });
    expect(payment.currency).toEqual('BTC');
    expect(payment.usdAmount).toEqual(25.00);
    expect(payment.exchangeRate).toEqual(85000);
    expect(payment.requiredConfirmations).toEqual(3);
  });

  it('currency USDT et requiredConfirmations 1 par défaut', async () => {
    const payment = await Payment.create({
      ...validPayment,
      paymentId: 'PAY-BTC002',
    });
    expect(payment.currency).toEqual('USDT');
    expect(payment.requiredConfirmations).toEqual(1);
  });

  it('rejette une currency invalide', async () => {
    await expect(
      Payment.create({ ...validPayment, paymentId: 'PAY-BTC003', currency: 'ETH' })
    ).rejects.toThrow();
  });

  it('toPublicJSON inclut currency, usdAmount et exchangeRate', async () => {
    const payment = await Payment.create({
      ...validPayment,
      paymentId: 'PAY-BTC004',
      currency: 'BTC',
      usdAmount: 25.00,
      amount: 0.00029412,
      exchangeRate: 85000,
    });
    const json = payment.toPublicJSON();
    expect(json.currency).toEqual('BTC');
    expect(json.usdAmount).toEqual(25.00);
    expect(json.exchangeRate).toEqual(85000);
    expect(json.privateKey).toBeUndefined();
    expect(json.wallet).toBeUndefined();
  });
});
```

- [ ] **Run to confirm failure**

```bash
npm run test:unit -- --testPathPattern=models
```

Expected: FAIL — new fields don't exist yet.

- [ ] **Add BTC fields to the Payment schema** in `src/models/Payment.js`

Add after the `externalRef` field, before the closing `}` of the schema definition:

```js
    // Devise du paiement
    currency: {
      type: String,
      enum: ['USDT', 'BTC'],
      default: 'USDT',
      index: true,
    },

    // Montant en USD passé par le marchand (= amount pour USDT, ≠ amount pour BTC)
    usdAmount: {
      type: Number,
      default: null,
    },

    // Taux de change USD/crypto au moment de la création (null pour USDT)
    exchangeRate: {
      type: Number,
      default: null,
    },

    // Confirmations blockchain requises pour valider (1 USDT, 3 BTC)
    requiredConfirmations: {
      type: Number,
      default: 1,
    },
```

- [ ] **Replace `toPublicJSON`** in `src/models/Payment.js`:

```js
paymentSchema.methods.toPublicJSON = function () {
  return {
    paymentId: this.paymentId,
    currency: this.currency,
    amount: this.amount,
    usdAmount: this.usdAmount,
    exchangeRate: this.exchangeRate,
    status: this.status,
    walletAddress: this.wallet.address,
    qrCode: this.qrCode,
    txHash: this.txHash,
    senderAddress: this.senderAddress,
    receivedAmount: this.receivedAmount,
    sweepStatus: this.sweepStatus,
    expiresAt: this.expiresAt,
    metadata: this.metadata,
    description: this.description,
    externalRef: this.externalRef,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};
```

- [ ] **Run to confirm tests pass**

```bash
npm run test:unit -- --testPathPattern=models
```

Expected: All tests PASS.

- [ ] **Commit**

```bash
git add src/models/Payment.js tests/unit/models.test.js
git commit -m "feat: Payment model — add currency, usdAmount, exchangeRate, requiredConfirmations"
```

---

## Task 3: priceService

**Files:**
- Create: `src/services/priceService.js`
- Create: `tests/unit/priceService.test.js`

- [ ] **Create `tests/unit/priceService.test.js`**

```js
jest.mock('axios');
const axios = require('axios');

let priceService;
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  priceService = require('../../src/services/priceService');
});

describe('priceService.getBTCRate()', () => {
  it('retourne le taux USD/BTC depuis CoinGecko', async () => {
    axios.get.mockResolvedValueOnce({ data: { bitcoin: { usd: 85000 } } });

    const rate = await priceService.getBTCRate();
    expect(rate).toEqual(85000);
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get.mock.calls[0][0]).toContain('coingecko');
  });

  it('utilise le cache si appelé deux fois dans les 60s', async () => {
    axios.get.mockResolvedValueOnce({ data: { bitcoin: { usd: 85000 } } });

    await priceService.getBTCRate();
    const rate = await priceService.getBTCRate();
    expect(rate).toEqual(85000);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('utilise Binance en fallback si CoinGecko échoue', async () => {
    axios.get
      .mockRejectedValueOnce(new Error('CoinGecko timeout'))
      .mockResolvedValueOnce({ data: { price: '85000.50' } });

    const rate = await priceService.getBTCRate();
    expect(rate).toBeCloseTo(85000.5);
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(axios.get.mock.calls[1][0]).toContain('binance');
  });

  it('throw si CoinGecko et Binance échouent tous les deux', async () => {
    axios.get
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'));

    await expect(priceService.getBTCRate()).rejects.toThrow(
      'Impossible de récupérer le taux BTC/USD'
    );
  });

  it('renouvelle le cache après expiration', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { bitcoin: { usd: 85000 } } })
      .mockResolvedValueOnce({ data: { bitcoin: { usd: 86000 } } });

    await priceService.getBTCRate();
    priceService._expireCache();
    const rate = await priceService.getBTCRate();
    expect(rate).toEqual(86000);
    expect(axios.get).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Run to confirm failure**

```bash
npm run test:unit -- --testPathPattern=priceService
```

Expected: FAIL — module not found.

- [ ] **Create `src/services/priceService.js`**

```js
const axios = require('axios');

const CACHE_TTL_MS = 60 * 1000;

class PriceService {
  constructor() {
    this._cache = null; // { rate: number, fetchedAt: number }
  }

  /**
   * Retourne le taux BTC/USD courant.
   * Cache 60 secondes. Fallback Binance si CoinGecko indisponible.
   * @returns {Promise<number>}
   */
  async getBTCRate() {
    if (this._cache && Date.now() - this._cache.fetchedAt < CACHE_TTL_MS) {
      return this._cache.rate;
    }

    let rate;
    try {
      rate = await this._fetchFromCoinGecko();
    } catch {
      try {
        rate = await this._fetchFromBinance();
      } catch {
        throw new Error(
          'Impossible de récupérer le taux BTC/USD : CoinGecko et Binance indisponibles'
        );
      }
    }

    this._cache = { rate, fetchedAt: Date.now() };
    return rate;
  }

  async _fetchFromCoinGecko() {
    const resp = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { timeout: 5000 }
    );
    return resp.data.bitcoin.usd;
  }

  async _fetchFromBinance() {
    const resp = await axios.get(
      'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      { timeout: 5000 }
    );
    return parseFloat(resp.data.price);
  }

  _clearCache() {
    this._cache = null;
  }

  _expireCache() {
    if (this._cache) {
      this._cache.fetchedAt = Date.now() - CACHE_TTL_MS - 1;
    }
  }
}

module.exports = new PriceService();
```

- [ ] **Run to confirm tests pass**

```bash
npm run test:unit -- --testPathPattern=priceService
```

Expected: All 5 tests PASS.

- [ ] **Commit**

```bash
git add src/services/priceService.js tests/unit/priceService.test.js
git commit -m "feat: add priceService — BTC/USD rate with CoinGecko + Binance fallback and 60s cache"
```

---

## Task 4: btcService — wallet generation

**Files:**
- Create: `src/services/btcService.js`
- Create: `tests/unit/btcService.test.js`

- [ ] **Create `tests/unit/btcService.test.js`** with wallet generation tests:

```js
jest.mock('axios');
const axios = require('axios');

let btcService;
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  btcService = require('../../src/services/btcService');
});

describe('btcService.generateWallet()', () => {
  it('génère une adresse bech32 mainnet (bc1q...) et une clé WIF', () => {
    const wallet = btcService.generateWallet();
    expect(wallet.address).toMatch(/^bc1q[a-z0-9]{38,}$/);
    expect(wallet.privateKeyWIF).toMatch(/^[KLc][1-9A-HJ-NP-Za-km-z]{51}$/);
    expect(wallet.publicKey).toBeDefined();
    expect(wallet.publicKey).toHaveLength(33); // compressed pubkey
  });

  it('génère des wallets uniques', () => {
    const w1 = btcService.generateWallet();
    const w2 = btcService.generateWallet();
    expect(w1.address).not.toEqual(w2.address);
    expect(w1.privateKeyWIF).not.toEqual(w2.privateKeyWIF);
  });
});
```

- [ ] **Run to confirm failure**

```bash
npm run test:unit -- --testPathPattern=btcService
```

Expected: FAIL — module not found.

- [ ] **Create `src/services/btcService.js`**

```js
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
}

module.exports = new BtcService();
```

- [ ] **Run to confirm tests pass**

```bash
npm run test:unit -- --testPathPattern=btcService
```

Expected: 2 wallet tests PASS.

- [ ] **Commit**

```bash
git add src/services/btcService.js tests/unit/btcService.test.js
git commit -m "feat: btcService — P2WPKH wallet generation via bitcoinjs-lib"
```

---

## Task 5: btcService — balance and transactions

**Files:**
- Modify: `src/services/btcService.js`
- Modify: `tests/unit/btcService.test.js`

- [ ] **Add failing tests** — append to `tests/unit/btcService.test.js`:

```js
describe('btcService.getBalance()', () => {
  it('retourne le solde confirmé en BTC', async () => {
    axios.get.mockResolvedValueOnce({
      data: { balance: 29412, unconfirmed_balance: 0 },
    });
    const balance = await btcService.getBalance('bc1qtest');
    expect(balance).toBeCloseTo(0.00029412, 8);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/addrs/bc1qtest/balance'),
      expect.any(Object)
    );
  });

  it('retourne 0 si erreur Blockcypher', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network error'));
    const balance = await btcService.getBalance('bc1qtest');
    expect(balance).toEqual(0);
  });
});

describe('btcService.getIncomingTransactions()', () => {
  it('retourne les transactions reçues', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        txrefs: [
          {
            tx_hash: 'abc123',
            tx_input_n: -1,
            tx_output_n: 0,
            value: 29412,
            confirmations: 3,
            confirmed: '2024-01-15T10:30:00Z',
            spent: false,
          },
        ],
      },
    });
    const txs = await btcService.getIncomingTransactions('bc1qtest', 0);
    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toEqual('abc123');
    expect(txs[0].amount).toBeCloseTo(0.00029412, 8);
    expect(txs[0].confirmations).toEqual(3);
  });

  it('ignore les outputs déjà dépensés', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        txrefs: [
          { tx_hash: 'abc', tx_input_n: -1, tx_output_n: 0, value: 10000, confirmations: 6, spent: true },
          { tx_hash: 'def', tx_input_n: -1, tx_output_n: 0, value: 20000, confirmations: 3, spent: false },
        ],
      },
    });
    const txs = await btcService.getIncomingTransactions('bc1qtest', 0);
    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toEqual('def');
  });

  it('retourne [] si aucune transaction', async () => {
    axios.get.mockResolvedValueOnce({ data: {} });
    const txs = await btcService.getIncomingTransactions('bc1qtest', 0);
    expect(txs).toEqual([]);
  });
});

describe('btcService.getTransactionConfirmations()', () => {
  it('retourne le nombre de confirmations', async () => {
    axios.get.mockResolvedValueOnce({ data: { confirmations: 2 } });
    const confs = await btcService.getTransactionConfirmations('abc123');
    expect(confs).toEqual(2);
  });

  it('retourne 0 si la transaction est introuvable', async () => {
    axios.get.mockRejectedValueOnce(new Error('Not found'));
    const confs = await btcService.getTransactionConfirmations('abc123');
    expect(confs).toEqual(0);
  });
});
```

- [ ] **Run to confirm failure**

```bash
npm run test:unit -- --testPathPattern=btcService
```

Expected: new tests FAIL — methods don't exist yet.

- [ ] **Add methods to `src/services/btcService.js`** (inside the class, before closing `}`):

```js
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
   * @returns {Promise<Array<{ txHash, amount, confirmations, timestamp }>>}
   */
  async getIncomingTransactions(address) {
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
```

- [ ] **Run to confirm tests pass**

```bash
npm run test:unit -- --testPathPattern=btcService
```

Expected: All tests PASS.

- [ ] **Commit**

```bash
git add src/services/btcService.js tests/unit/btcService.test.js
git commit -m "feat: btcService — getBalance, getIncomingTransactions, getTransactionConfirmations"
```

---

## Task 6: btcService — sweep

**Files:**
- Modify: `src/services/btcService.js`
- Modify: `tests/unit/btcService.test.js`

- [ ] **Add failing sweep tests** — append to `tests/unit/btcService.test.js`:

```js
describe('btcService.sweepBTC()', () => {
  it('construit et broadcast une tx avec 2 outputs (fees + central)', async () => {
    const wallet = btcService.generateWallet();
    const destWallet = btcService.generateWallet();
    const feesWallet = btcService.generateWallet();

    // Mock UTXOs
    axios.get.mockResolvedValueOnce({
      data: {
        txrefs: [{ tx_hash: 'utxo_hash1', tx_output_n: 0, value: 100000, spent: false }],
      },
    });
    // Mock fee rate
    axios.get.mockResolvedValueOnce({ data: { medium_fee_per_kb: 10000 } });
    // Mock broadcast
    axios.post.mockResolvedValueOnce({ data: { tx: { hash: 'sweep_tx_hash' } } });

    const result = await btcService.sweepBTC(
      wallet.privateKeyWIF,
      wallet.address,
      destWallet.address,
      feesWallet.address,
      0.03
    );

    expect(result.txHash).toEqual('sweep_tx_hash');
    expect(result.feesAmount).toBeGreaterThan(0);
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/txs/push'),
      expect.objectContaining({ tx: expect.any(String) }),
      expect.any(Object)
    );
  });

  it('sweep sans frais (feesPercentage = 0) avec 1 seul output', async () => {
    const wallet = btcService.generateWallet();
    const destWallet = btcService.generateWallet();

    axios.get.mockResolvedValueOnce({
      data: {
        txrefs: [{ tx_hash: 'utxo_hash2', tx_output_n: 0, value: 50000, spent: false }],
      },
    });
    axios.get.mockResolvedValueOnce({ data: { medium_fee_per_kb: 10000 } });
    axios.post.mockResolvedValueOnce({ data: { tx: { hash: 'sweep_tx2' } } });

    const result = await btcService.sweepBTC(
      wallet.privateKeyWIF,
      wallet.address,
      destWallet.address,
      null,
      0
    );

    expect(result.txHash).toEqual('sweep_tx2');
    expect(result.feesAmount).toEqual(0);
  });

  it('throw si aucun UTXO disponible', async () => {
    const wallet = btcService.generateWallet();
    const destWallet = btcService.generateWallet();

    axios.get.mockResolvedValueOnce({ data: {} });

    await expect(
      btcService.sweepBTC(wallet.privateKeyWIF, wallet.address, destWallet.address, null, 0)
    ).rejects.toThrow('Aucun UTXO disponible');
  });
});
```

- [ ] **Run to confirm failure**

```bash
npm run test:unit -- --testPathPattern=btcService
```

Expected: sweep tests FAIL.

- [ ] **Add `sweepBTC` to `src/services/btcService.js`** (inside the class):

```js
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
      psbt.addInput({
        hash: utxo.tx_hash,
        index: utxo.tx_output_n,
        witnessUtxo: {
          script: p2wpkh.output,
          value: utxo.value,
        },
      });
    }

    if (feesSats > 0) {
      psbt.addOutput({ address: feesWalletAddress, value: feesSats });
    }
    psbt.addOutput({ address: toAddress, value: netSats });

    psbt.signAllInputs(keyPair);
    psbt.finalizeAllInputs();
    const txHex = psbt.extractTransaction().toHex();

    // 6. Broadcast
    const broadcastResp = await axios.post(
      `${this.baseUrl}/txs/push`,
      { tx: txHex },
      { params: tokenParams, timeout: 15000 }
    );

    const txHash = broadcastResp.data.tx.hash;
    console.log(`💸 BTC Sweep: ${fromAddress} → ${toAddress} (tx: ${txHash})`);

    return {
      txHash,
      feesAmount: feesSats / 1e8,
    };
  }
```

- [ ] **Run to confirm all tests pass**

```bash
npm run test:unit -- --testPathPattern=btcService
```

Expected: All tests PASS.

- [ ] **Commit**

```bash
git add src/services/btcService.js tests/unit/btcService.test.js
git commit -m "feat: btcService — sweepBTC with PSBT signing and Blockcypher broadcast"
```

---

## Task 7: qrCodeService — BIP21 support

**Files:**
- Modify: `src/services/qrCodeService.js`

- [ ] **Update `generatePaymentQR` to accept `currency` in options**

In `src/services/qrCodeService.js`, update the destructuring inside `generatePaymentQR` to add `currency`:

```js
  async generatePaymentQR(address, amount, options = {}) {
    const {
      width = 300,
      margin = 2,
      darkColor = '#000000',
      lightColor = '#ffffff',
      format = 'datauri',
      currency = 'USDT',
    } = options;

    const paymentUri = this._buildPaymentUri(address, amount, currency);
    // ... rest of the method is unchanged
```

- [ ] **Replace `_buildPaymentUri`**

```js
  /**
   * Construit l'URI de paiement selon la devise
   * - USDT: juste l'adresse (wallets Tron ne supportent pas l'URI TRC-20 étendu)
   * - BTC: BIP21 — bitcoin:<address>?amount=<btc>
   * @param {string} address
   * @param {number} amount - Montant dans la devise native
   * @param {string} currency
   * @returns {string}
   */
  _buildPaymentUri(address, amount, currency = 'USDT') {
    if (currency === 'BTC') {
      const btcAmount = parseFloat(amount.toFixed(8));
      return `bitcoin:${address}?amount=${btcAmount}`;
    }
    return address;
  }
```

- [ ] **Run all unit tests to verify no regression**

```bash
npm run test:unit
```

Expected: All PASS.

- [ ] **Commit**

```bash
git add src/services/qrCodeService.js
git commit -m "feat: qrCodeService — BIP21 URI support for BTC QR codes"
```

---

## Task 8: paymentService — BTC routing

**Files:**
- Modify: `src/services/paymentService.js`

- [ ] **Replace require block** at the top of `src/services/paymentService.js`:

```js
const { v4: uuidv4 } = require('uuid');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const tronService = require('./tronService');
const btcService = require('./btcService');
const priceService = require('./priceService');
const qrCodeService = require('./qrCodeService');
const { encrypt } = require('../utils/encryption');
const config = require('../config');

const blockchainServices = {
  USDT: tronService,
  BTC: btcService,
};
```

- [ ] **Replace `createPayment`** in `src/services/paymentService.js`:

```js
  async createPayment(amount, options = {}, req = null) {
    const currency = (options.currency || 'USDT').toUpperCase();

    if (!blockchainServices[currency]) {
      throw new Error(`Devise non supportée: ${currency}`);
    }

    // Idempotence
    if (options.externalRef) {
      const existing = await Payment.findOne({ externalRef: options.externalRef });
      if (existing) return existing.toPublicJSON();
    }

    // Conversion et paramètres par devise
    let usdAmount, cryptoAmount, exchangeRate, requiredConfirmations, expirationMinutes;

    if (currency === 'BTC') {
      exchangeRate = await priceService.getBTCRate();
      usdAmount = amount;
      cryptoAmount = parseFloat((usdAmount / exchangeRate).toFixed(8));
      requiredConfirmations = config.btc.payment.requiredConfirmations;
      expirationMinutes = config.btc.payment.expirationMinutes;
    } else {
      // USDT : taux 1:1 USD
      exchangeRate = 1;
      usdAmount = amount;
      cryptoAmount = amount;
      requiredConfirmations = 1;
      expirationMinutes = config.payment.expirationMinutes;
    }

    // Générer le wallet dédié
    const walletData = currency === 'BTC'
      ? btcService.generateWallet()
      : await tronService.generateWallet();

    const walletAddress = walletData.address;
    const rawPrivateKey = currency === 'BTC'
      ? walletData.privateKeyWIF
      : walletData.privateKey;

    // Chiffrer la clé privée si ENCRYPTION_KEY configurée
    let storedPrivateKey = rawPrivateKey;
    if (config.encryption.masterKey) {
      storedPrivateKey = encrypt(rawPrivateKey, config.encryption.masterKey);
    }

    // QR code (BIP21 pour BTC, adresse simple pour USDT)
    const qrCode = await qrCodeService.generatePaymentQR(walletAddress, cryptoAmount, {
      currency,
    });

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

    const payment = await Payment.create({
      paymentId: `PAY-${uuidv4().split('-')[0].toUpperCase()}`,
      currency,
      amount: cryptoAmount,
      usdAmount,
      exchangeRate,
      requiredConfirmations,
      status: 'pending',
      wallet: {
        address: walletAddress,
        privateKey: storedPrivateKey,
        base58: walletAddress,
      },
      qrCode,
      expiresAt,
      metadata: options.metadata || {},
      description: options.description || '',
      externalRef: options.externalRef || null,
    });

    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'payment_created',
      req,
    });

    const label = currency === 'BTC'
      ? `${cryptoAmount} BTC (~$${usdAmount} USD)`
      : `${amount} USDT`;
    console.log(`💳 Paiement créé: ${payment.paymentId} - ${label} → ${walletAddress}`);

    return payment.toPublicJSON();
  }
```

- [ ] **Run all unit tests**

```bash
npm run test:unit
```

Expected: All PASS.

- [ ] **Commit**

```bash
git add src/services/paymentService.js
git commit -m "feat: paymentService — multi-currency registry and BTC payment creation with USD conversion"
```

---

## Task 9: paymentMonitor — BTC confirmation logic

**Files:**
- Modify: `src/jobs/paymentMonitor.js`

- [ ] **Replace the require block** at the top of `src/jobs/paymentMonitor.js`:

```js
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const tronService = require('../services/tronService');
const btcService = require('../services/btcService');
const webhookService = require('../services/webhookService');
const retryService = require('../services/retryService');
const { decrypt } = require('../utils/encryption');
const config = require('../config');
```

- [ ] **Replace `_checkPendingPayments`** in `src/jobs/paymentMonitor.js`:

```js
  async _checkPendingPayments() {
    const graceCutoff = new Date(Date.now() - config.payment.gracePeriodSeconds * 1000);

    // Inclut les paiements BTC 'confirming' (attente de confirmations supplémentaires)
    const paymentsToCheck = await Payment.find({
      $or: [
        { status: 'pending', expiresAt: { $gt: graceCutoff } },
        { status: 'confirming', currency: 'BTC' },
      ],
    });

    for (const payment of paymentsToCheck) {
      try {
        if (payment.currency === 'BTC') {
          await this._checkBTCPayment(payment);
        } else {
          await this._checkUSDTPayment(payment);
        }
      } catch (error) {
        console.error(`Erreur vérification ${payment.paymentId}:`, error.message);
      }
      await this._sleep(1000);
    }
  }
```

- [ ] **Add `_checkUSDTPayment`** (extrait de l'ancienne méthode) — ajouter après `_checkPendingPayments`:

```js
  async _checkUSDTPayment(payment) {
    const balance = await tronService.getUSDTBalance(payment.wallet.address);
    const minAccepted = payment.amount * (1 - config.payment.amountTolerance);

    if (balance >= minAccepted) {
      const isPartial = balance < payment.amount;
      const isOverpaid = balance > payment.amount;
      const isLate = new Date() > payment.expiresAt;
      console.log(
        `✅ Paiement reçu: ${payment.paymentId} - ${balance}/${payment.amount} USDT` +
        `${isPartial ? ' (tolérance)' : ''}${isOverpaid ? ' (sur-paiement)' : ''}${isLate ? ' (tardif)' : ''}`
      );

      const txs = await tronService.getIncomingUSDTTransactions(
        payment.wallet.address,
        payment.createdAt.getTime()
      );
      const matchingTx = txs.find(tx => tx.amount >= minAccepted);

      payment.status = 'confirmed';
      payment.receivedAmount = isOverpaid ? payment.amount : balance;
      payment.txHash = matchingTx?.txHash || null;
      payment.senderAddress = matchingTx?.from || null;
      payment.confirmations = 1;
      payment.sweepStatus = 'pending';
      await payment.save();

      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_confirmed',
        details: matchingTx?.txHash ? { txHash: matchingTx.txHash } : {},
      });

      try {
        await webhookService.sendConfirmation(payment);
      } catch (webhookErr) {
        console.error(`⚠️ Webhook initial échoué, retry planifié: ${webhookErr.message}`);
        retryService.scheduleWebhookRetry(payment, p => webhookService.sendConfirmation(p));
      }
    } else if (balance > 0 && balance < minAccepted) {
      console.log(`⚠️ Montant partiel: ${payment.paymentId} - ${balance}/${payment.amount} USDT`);
      payment.receivedAmount = balance;
      await payment.save();
      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_partial_received',
        level: 'warn',
      });
    }
  }
```

- [ ] **Add `_checkBTCPayment`** après `_checkUSDTPayment`:

```js
  async _checkBTCPayment(payment) {
    const minAccepted = payment.amount * (1 - config.btc.payment.amountTolerance);

    const balance = await btcService.getBalance(payment.wallet.address);
    if (balance < minAccepted) return;

    const txs = await btcService.getIncomingTransactions(payment.wallet.address);
    const matchingTx = txs.find(tx => tx.amount >= minAccepted);
    if (!matchingTx) return;

    const confirmations = await btcService.getTransactionConfirmations(matchingTx.txHash);

    // Mettre à jour les champs communs
    payment.confirmations = confirmations;
    payment.txHash = payment.txHash || matchingTx.txHash;
    payment.receivedAmount = payment.receivedAmount || balance;

    if (confirmations >= payment.requiredConfirmations) {
      // Seuil atteint — valider (depuis pending ou confirming)
      payment.status = 'confirmed';
      payment.sweepStatus = 'pending';
      await payment.save();
      console.log(
        `✅ BTC confirmé: ${payment.paymentId} (${confirmations}/${payment.requiredConfirmations} confirmations, tx: ${matchingTx.txHash})`
      );

      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_confirmed',
        details: { txHash: matchingTx.txHash, confirmations },
      });

      try {
        await webhookService.sendConfirmation(payment);
      } catch (webhookErr) {
        console.error(`⚠️ Webhook BTC initial échoué, retry planifié: ${webhookErr.message}`);
        retryService.scheduleWebhookRetry(payment, p => webhookService.sendConfirmation(p));
      }
    } else if (payment.status === 'pending' && confirmations >= 1) {
      // Première confirmation — passer en confirming
      payment.status = 'confirming';
      await payment.save();
      console.log(
        `🔄 BTC confirming: ${payment.paymentId} (${confirmations}/${payment.requiredConfirmations} confirmation(s))`
      );
      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_confirming',
        details: { txHash: matchingTx.txHash, confirmations },
      });
    } else if (payment.status === 'confirming') {
      // Mise à jour du compteur uniquement
      await payment.save();
    }
  }
```

- [ ] **Replace `_processSweeps`** dans `src/jobs/paymentMonitor.js`:

```js
  async _processSweeps() {
    const toSweep = await Payment.find({
      status: 'confirmed',
      sweepStatus: 'pending',
    });

    for (const payment of toSweep) {
      try {
        payment.sweepStatus = 'processing';
        await payment.save();

        console.log(
          `💸 Sweep en cours: ${payment.paymentId} - ${payment.receivedAmount} ${payment.currency}`
        );
        await AuditLog.log({ paymentId: payment.paymentId, action: 'sweep_initiated' });

        const privateKey = this._decryptPrivateKey(payment.wallet.privateKey);

        if (payment.currency === 'BTC') {
          await this._sweepBTCPayment(payment, privateKey);
        } else {
          await this._sweepUSDTPayment(payment, privateKey);
        }
      } catch (error) {
        console.error(`❌ Sweep échoué ${payment.paymentId}:`, error.message);
        payment.sweepStatus = 'failed';
        await payment.save();

        await AuditLog.log({
          paymentId: payment.paymentId,
          action: 'sweep_failed',
          level: 'error',
          details: { error: error.message },
        });

        retryService.scheduleSweepRetry(payment, (pk, addr, amt) => {
          const decryptedKey = this._decryptPrivateKey(pk);
          if (payment.currency === 'BTC') {
            return btcService.sweepBTC(
              decryptedKey,
              addr,
              config.btc.centralWallet.address,
              config.btc.feesWalletAddress,
              config.fees.percentage
            );
          }
          return tronService.sweepUSDT(decryptedKey, addr, amt);
        });
      }

      await this._sleep(3000);
    }
  }
```

- [ ] **Add `_sweepUSDTPayment`** (contenu extrait de l'ancienne `_processSweeps`) — après `_processSweeps`:

```js
  async _sweepUSDTPayment(payment, privateKey) {
    const actualBalance = await tronService.getUSDTBalance(payment.wallet.address);
    const sweepTotal = Math.floor(actualBalance * 1e6) / 1e6;

    const hasFees = config.fees.walletAddress && config.fees.percentage > 0;
    const nbTransfers = hasFees ? 2 : 1;

    await tronService.ensureGasForSweep(payment.wallet.address, nbTransfers);

    let feesAmount = null, feesTxHash = null, sweepTxHash;

    if (hasFees) {
      feesAmount = Math.floor(sweepTotal * config.fees.percentage * 1e6) / 1e6;
      const netAmount = Math.floor((sweepTotal - feesAmount) * 1e6) / 1e6;
      console.log(`💰 Frais: ${feesAmount} USDT (${config.fees.percentage * 100}%) → fees wallet`);

      feesTxHash = await tronService.sweepUSDT(
        privateKey, payment.wallet.address, feesAmount, config.fees.walletAddress
      );
      await this._sleep(3000);
      sweepTxHash = await tronService.sweepUSDT(
        privateKey, payment.wallet.address, netAmount, config.tron.centralWallet.address
      );
    } else {
      sweepTxHash = await tronService.sweepUSDT(
        privateKey, payment.wallet.address, sweepTotal, config.tron.centralWallet.address
      );
    }

    payment.sweepTxHash = sweepTxHash;
    payment.feesAmount = feesAmount;
    payment.feesTxHash = feesTxHash;
    payment.sweepStatus = 'completed';
    payment.status = 'swept';
    await payment.save();

    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'sweep_completed',
      details: { txHash: sweepTxHash },
    });
    console.log(`✅ Sweep USDT terminé: ${payment.paymentId} → tx: ${sweepTxHash}`);
    await webhookService.sendSweepCompleted(payment);
  }
```

- [ ] **Add `_sweepBTCPayment`** après `_sweepUSDTPayment`:

```js
  async _sweepBTCPayment(payment, privateKeyWIF) {
    const feesWalletAddress = config.btc.feesWalletAddress || null;
    const feesPercentage = feesWalletAddress && config.fees.percentage > 0
      ? config.fees.percentage
      : 0;

    const { txHash, feesAmount } = await btcService.sweepBTC(
      privateKeyWIF,
      payment.wallet.address,
      config.btc.centralWallet.address,
      feesWalletAddress,
      feesPercentage
    );

    payment.sweepTxHash = txHash;
    payment.feesAmount = feesAmount > 0 ? feesAmount : null;
    payment.feesTxHash = null; // fees inclus dans la même tx BTC
    payment.sweepStatus = 'completed';
    payment.status = 'swept';
    await payment.save();

    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'sweep_completed',
      details: { txHash },
    });
    console.log(`✅ Sweep BTC terminé: ${payment.paymentId} → tx: ${txHash}`);
    await webhookService.sendSweepCompleted(payment);
  }
```

- [ ] **Run all tests**

```bash
npm run test:unit
```

Expected: All PASS.

- [ ] **Commit**

```bash
git add src/jobs/paymentMonitor.js
git commit -m "feat: paymentMonitor — BTC confirmation logic (1→confirming, 3→confirmed) and BTC sweep"
```

---

## Task 10: paymentController + PHP docs

**Files:**
- Modify: `src/controllers/paymentController.js`
- Modify: `PHP_INTEGRATION.md`

- [ ] **Replace la méthode `create`** dans `src/controllers/paymentController.js`:

```js
  async create(req, res) {
    try {
      const { amount, currency = 'USDT', metadata, description, externalRef } = req.body;
      const normalizedCurrency = currency.toUpperCase();

      if (!['USDT', 'BTC'].includes(normalizedCurrency)) {
        return res.status(400).json({
          error: `Devise non supportée: ${currency}. Valeurs acceptées: USDT, BTC`,
        });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Montant invalide. Doit être > 0.' });
      }

      if (normalizedCurrency === 'USDT' && amount < 0.01) {
        return res.status(400).json({ error: 'Montant minimum: 0.01 USDT' });
      }

      if (normalizedCurrency === 'BTC' && amount < 1) {
        return res.status(400).json({
          error: 'Montant minimum: 1 USD pour les paiements BTC',
        });
      }

      const payment = await paymentService.createPayment(amount, {
        currency: normalizedCurrency,
        metadata,
        description,
        externalRef,
      }, req);

      return res.status(201).json({ success: true, payment });
    } catch (error) {
      console.error('Erreur création paiement:', error);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }
```

- [ ] **Run all tests**

```bash
npm run test:unit
```

Expected: All PASS.

- [ ] **Add the BTC section to `PHP_INTEGRATION.md`**

Append after the last `---` in `PHP_INTEGRATION.md`:

````markdown
## Paiements BTC

### Créer un paiement BTC

```php
$result = $api->createPayment(
    amount: 25.00,           // Toujours en USD pour BTC
    metadata: ['order_id' => '789'],
    externalRef: 'order-789' // optionnel
);

$payment = $result['payment'];

echo $payment['currency'];      // "BTC"
echo $payment['usdAmount'];     // 25.00  (USD — ce que tu as passé)
echo $payment['amount'];        // 0.00029412  (BTC à envoyer)
echo $payment['exchangeRate'];  // 85000  (taux USD/BTC au moment de la création)
echo $payment['walletAddress']; // "bc1q..."  adresse Bitcoin
echo $payment['qrCode'];        // data URI — format BIP21 bitcoin:<address>?amount=<btc>
echo $payment['expiresAt'];     // ISO 8601 — expiration dans 60 min
```

### Statuts spécifiques BTC

| Statut | Signification |
|---|---|
| `pending` | En attente — aucune transaction détectée |
| `confirming` | 1 confirmation reçue, en attente des 2 suivantes (~20 min) |
| `confirmed` | 3 confirmations — paiement validé ✅ |
| `swept` | Fonds transférés au wallet central ✅ |
| `expired` | 60 min écoulées sans transaction |

> Considère `confirmed` et `swept` comme paiement réussi.
> Le statut `confirming` est intermédiaire — **ne pas livrer encore** à ce stade.

### Variables d'environnement Render à ajouter

```env
BTC_NETWORK=mainnet
BTC_CENTRAL_WALLET_ADDRESS=bc1q...
BTC_CENTRAL_WALLET_WIF=
BTC_FEES_WALLET_ADDRESS=bc1q...
BLOCKCYPHER_TOKEN=          # optionnel, augmente les rate limits
```
````

- [ ] **Commit final**

```bash
git add src/controllers/paymentController.js PHP_INTEGRATION.md
git commit -m "feat: paymentController — currency/amount validation + BTC PHP integration docs"
```
