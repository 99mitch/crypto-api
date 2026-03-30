let priceService;
let axios;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  // Mock axios BEFORE requiring priceService
  jest.mock('axios', () => ({
    get: jest.fn(),
  }));

  axios = require('axios');
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
