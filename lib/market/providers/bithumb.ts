import { INSTRUMENTS } from '../catalog';
import type { MarketQuote } from '../types';

const DEFAULT_MARKETS = ['KRW-BTC', 'KRW-ETH', 'KRW-SOL', 'KRW-XRP', 'KRW-DOGE'];
type BithumbTicker = {
  market: string;
  trade_price: number;
  signed_change_rate: number;
  acc_trade_price_24h: number;
  timestamp: number;
};

function finiteNumber(value: number) {
  return Number.isFinite(value) ? value : null;
}

export async function fetchBithumbQuotes(
  fetcher: typeof fetch = fetch,
  markets = DEFAULT_MARKETS,
): Promise<MarketQuote[]> {
  const response = await fetcher(`https://api.bithumb.com/v1/ticker?markets=${encodeURIComponent(markets.join(','))}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Bithumb 시세 요청에 실패했습니다. (${response.status})`);
  const tickers = await response.json() as BithumbTicker[];

  return tickers.map((ticker) => {
    const symbol = ticker.market.replace(/^KRW-/, '');
    const instrument = INSTRUMENTS.find((item) => item.symbol === symbol);
    const price = finiteNumber(ticker.trade_price);
    return {
      symbol,
      name: instrument?.name ?? symbol,
      nameKo: instrument?.nameKo,
      nameEn: instrument?.nameEn,
      assetClass: 'crypto',
      price,
      currency: 'KRW',
      changeRate: finiteNumber(ticker.signed_change_rate),
      previousClose: null,
      changeRateSource: finiteNumber(ticker.signed_change_rate) === null ? null : 'provider',
      tradingAmount: finiteNumber(ticker.acc_trade_price_24h),
      asOf: Number.isFinite(ticker.timestamp) ? new Date(ticker.timestamp).toISOString() : null,
      session: 'always-open',
      quality: price === null ? 'unavailable' : 'realtime',
      provider: 'bithumb',
      confidence: null,
      estimateInputs: [],
    } satisfies MarketQuote;
  });
}
