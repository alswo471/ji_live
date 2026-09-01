import { fetchToss } from '@/lib/toss-invest';
import { INSTRUMENTS } from '../catalog';
import { resolveSession, type SessionCalendar, type SessionWindow } from '../session';
import { calculateChangeRate, createPreviousCloseLoader, type PreviousCloseLoader } from '../previous-close';
import type { MarketQuote, MarketSession } from '../types';

export type TossRequester = (path: string) => Promise<unknown>;

type PriceResponse = { result: Array<{ symbol: string; timestamp: string; lastPrice: string; currency: 'KRW' | 'USD' }> };
type RankingResponse = { result: { rankings: Array<{ symbol: string; price: { changeRate: string | null }; tradingAmount: string }> } };
type IndicatorResponse = { result: Array<{ symbol: string; timestamp: string; lastPrice: string }> };
type ExchangeRateResponse = { result: { rate: string; validFrom: string } };
type KrCalendarResponse = { result: { today: { integrated: { preMarket: SessionWindow | null; regularMarket: SessionWindow | null; afterMarket: SessionWindow | null } | null } } };
type UsCalendarResponse = { result: { today: { dayMarket: SessionWindow | null; preMarket: SessionWindow | null; regularMarket: SessionWindow | null; afterMarket: SessionWindow | null } } };

const STOCKS_AND_QQQ = INSTRUMENTS.filter((item) => item.assetClass === 'kr-stock' || item.assetClass === 'us-stock' || item.symbol === 'QQQ');
const defaultRequester: TossRequester = (path) => fetchToss(path);
const defaultPreviousCloseLoader = createPreviousCloseLoader(defaultRequester);

function numberOrNull(value: string | null | undefined) {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? number : null;
}

function qualityFor(session: MarketSession) {
  return session === 'closed' ? 'stale' as const : 'realtime' as const;
}

export async function fetchTossMarketSnapshot(
  now = new Date(),
  request: TossRequester = defaultRequester,
  loadPreviousCloses: PreviousCloseLoader = request === defaultRequester ? defaultPreviousCloseLoader : async () => new Map(),
): Promise<MarketQuote[]> {
  const symbols = encodeURIComponent(STOCKS_AND_QQQ.map((item) => item.providerSymbol).join(','));
  const [pricesRaw, krRankingRaw, usRankingRaw, indicatorsRaw, exchangeRaw, krCalendarRaw, usCalendarRaw] = await Promise.all([
    request(`/api/v1/prices?symbols=${symbols}`),
    request('/api/v1/rankings?type=MARKET_TRADING_AMOUNT&marketCountry=KR&duration=realtime&count=100'),
    request('/api/v1/rankings?type=MARKET_TRADING_AMOUNT&marketCountry=US&duration=realtime&count=100'),
    request('/api/v1/market-indicators/prices?symbols=KOSPI'),
    request('/api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW'),
    request('/api/v1/market-calendar/KR'),
    request('/api/v1/market-calendar/US'),
  ]);
  const prices = pricesRaw as PriceResponse;
  const rankings = [krRankingRaw as RankingResponse, usRankingRaw as RankingResponse];
  const indicators = indicatorsRaw as IndicatorResponse;
  const exchange = exchangeRaw as ExchangeRateResponse;
  const krCalendar = krCalendarRaw as KrCalendarResponse;
  const usCalendar = usCalendarRaw as UsCalendarResponse;

  const krSessions: SessionCalendar = {
    day: null,
    pre: krCalendar.result.today.integrated?.preMarket ?? null,
    regular: krCalendar.result.today.integrated?.regularMarket ?? null,
    after: krCalendar.result.today.integrated?.afterMarket ?? null,
  };
  const usSessions: SessionCalendar = {
    day: usCalendar.result.today.dayMarket,
    pre: usCalendar.result.today.preMarket,
    regular: usCalendar.result.today.regularMarket,
    after: usCalendar.result.today.afterMarket,
  };
  const metrics = new Map<string, { changeRate: number | null; tradingAmount: number | null }>();
  for (const ranking of rankings) {
    for (const item of ranking.result.rankings) {
      metrics.set(item.symbol, { changeRate: numberOrNull(item.price.changeRate), tradingAmount: numberOrNull(item.tradingAmount) });
    }
  }
  const fallbackTargets = prices.result.filter((price) => metrics.get(price.symbol)?.changeRate === null || metrics.get(price.symbol)?.changeRate === undefined).map((price) => ({ symbol: price.symbol, asOf: price.timestamp }));
  const previousCloses = await loadPreviousCloses(fallbackTargets);
  const instruments = new Map(STOCKS_AND_QQQ.map((item) => [item.providerSymbol, item]));
  const quotes: MarketQuote[] = prices.result.flatMap((price) => {
    const instrument = instruments.get(price.symbol);
    if (!instrument) return [];
    const session = resolveSession(now, instrument.assetClass === 'kr-stock' ? krSessions : usSessions);
    const metric = metrics.get(price.symbol);
    const previousClose = previousCloses.get(price.symbol) ?? null;
    const providerChangeRate = metric?.changeRate ?? null;
    return [{
      symbol: instrument.symbol,
      name: instrument.name,
      assetClass: instrument.assetClass,
      price: numberOrNull(price.lastPrice),
      currency: instrument.currency,
      changeRate: providerChangeRate ?? calculateChangeRate(numberOrNull(price.lastPrice), previousClose),
      previousClose,
      changeRateSource: providerChangeRate === null ? (previousClose === null ? null : 'previous-close') : 'provider',
      tradingAmount: metric?.tradingAmount ?? null,
      asOf: price.timestamp,
      session,
      quality: qualityFor(session),
      provider: 'toss',
      confidence: null,
      estimateInputs: [],
    }];
  });

  const kospiInstrument = INSTRUMENTS.find((item) => item.symbol === 'KOSPI')!;
  const kospi = indicators.result.find((item) => item.symbol === 'KOSPI');
  const krSession = resolveSession(now, krSessions);
  if (kospi) quotes.push({
    symbol: kospiInstrument.symbol, name: kospiInstrument.name, assetClass: kospiInstrument.assetClass,
    price: numberOrNull(kospi.lastPrice), currency: kospiInstrument.currency, changeRate: null, previousClose: null, changeRateSource: null, tradingAmount: null,
    asOf: kospi.timestamp, session: krSession, quality: qualityFor(krSession), provider: 'toss', confidence: null, estimateInputs: [],
  });
  const fxInstrument = INSTRUMENTS.find((item) => item.symbol === 'USDKRW')!;
  quotes.push({
    symbol: fxInstrument.symbol, name: fxInstrument.name, assetClass: fxInstrument.assetClass,
    price: numberOrNull(exchange.result.rate), currency: fxInstrument.currency, changeRate: null, previousClose: null, changeRateSource: null, tradingAmount: null,
    asOf: exchange.result.validFrom, session: 'always-open', quality: 'realtime', provider: 'toss', confidence: null, estimateInputs: [],
  });
  return quotes;
}
