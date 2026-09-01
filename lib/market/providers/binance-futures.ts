import type { DerivativeTicker } from '../types';
import { assessTimestampFreshness } from '../freshness';

const DEFAULT_SYMBOLS = [
  'SAMSUNGEMUSDT',
  'NAVERUSDT',
  'HANMIUSDT',
  'LGELECTRONICSUSDT',
  'TSLAUSDT',
  'NVDAUSDT',
  'AAPLUSDT',
  'GOOGLUSDT',
];
const ENDPOINT = 'https://fapi.binance.com/fapi/v1/ticker/24hr';

type BinanceFuturesTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  closeTime: number;
  count?: number;
};

function finiteNumber(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finitePositive(value: string | number) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

export async function fetchBinanceFuturesTickers(
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
  symbols = DEFAULT_SYMBOLS,
): Promise<DerivativeTicker[]> {
  const response = await fetcher(ENDPOINT, {
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok)
    throw new Error(
      `Binance 선물 시세 요청에 실패했습니다. (${response.status})`,
    );
  const tickers = (await response.json()) as BinanceFuturesTicker[];
  const allowedSymbols = new Set(symbols);

  return tickers
    .filter((ticker) => allowedSymbols.has(ticker.symbol))
    .map((ticker) => {
      const assessed = assessTimestampFreshness(
        ticker.closeTime,
        now().getTime(),
        undefined,
        ticker.count === 0,
      );
      const price = assessed.freshness === 'unavailable'
        ? null
        : finitePositive(ticker.lastPrice);
      const percent = finiteNumber(ticker.priceChangePercent);
      return {
        provider: 'binance-futures',
        providerSymbol: ticker.symbol,
        price,
        changeRate: price === null || percent === null ? null : percent / 100,
        tradingAmount: finitePositive(ticker.quoteVolume),
        tradingAmountCurrency: 'USDT',
        asOf: assessed.asOf,
        freshness: assessed.freshness,
      } satisfies DerivativeTicker;
    });
}
