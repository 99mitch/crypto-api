let btcService;
let axios;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  // Mock axios BEFORE requiring btcService
  jest.mock('axios', () => ({
    get: jest.fn(),
  }));

  axios = require('axios');
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
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/txs/abc123'),
      expect.any(Object)
    );
  });

  it('retourne 0 si la transaction est introuvable', async () => {
    axios.get.mockRejectedValueOnce(new Error('Not found'));
    const confs = await btcService.getTransactionConfirmations('abc123');
    expect(confs).toEqual(0);
  });
});
