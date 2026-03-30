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
