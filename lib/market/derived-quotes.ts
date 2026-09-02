import { INSTRUMENTS, KRW_USDT_SANITY_BOUNDS } from './catalog';
import { resolveKrMarketSession } from './kr-market-session';
import type {
  DerivativeTicker,
  FxConversionInput,
  Instrument,
  MarketProvider,
  MarketQuote,
} from './types';

const sourceLabels: Record<MarketProvider, string> = {
  hyperliquid: 'Hyperliquid 파생상품',
  'binance-futures': 'Binance 무기한선물',
  'binance-spot': 'Binance 현물',
  bithumb: 'Bithumb',
};

function withinBounds(
  value: number | null,
  bounds: { minExclusive: number; maxExclusive: number } | undefined,
) {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value > 0 &&
    (!bounds || (value > bounds.minExclusive && value < bounds.maxExclusive))
  );
}

function oldestTimestamp(...values: string[]) {
  const timestamps = values.map((value) => new Date(value).getTime());
  if (timestamps.some((value) => !Number.isFinite(value))) return null;
  return new Date(Math.min(...timestamps)).toISOString();
}

export function createUnavailableQuote(
  instrument: Instrument,
  options: { now?: () => Date; holidays?: ReadonlySet<string> } = {},
): MarketQuote {
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    nameKo: instrument.nameKo,
    nameEn: instrument.nameEn,
    assetClass: instrument.assetClass,
    price: null,
    currency: instrument.currency,
    changeRate: null,
    previousClose: null,
    changeRateSource: null,
    tradingAmount: null,
    tradingAmountCurrency: null,
    volumeKind: null,
    asOf: null,
    session: instrument.assetClass === 'kr-stock'
      ? resolveKrMarketSession(options.now?.() ?? new Date(), options.holidays)
      : 'always-open',
    quality: 'unavailable',
    provider: instrument.provider,
    providerSymbol: instrument.providerSymbol,
    confidence: null,
    estimateInputs: [],
    priceKind: 'unavailable',
    comparisonBasis: null,
    sourceLabel: sourceLabels[instrument.provider],
  };
}

function validFxInput(fx: FxConversionInput | null): fx is FxConversionInput & {
  rate: number;
  asOf: string;
} {
  return (
    fx !== null &&
    fx.freshness !== 'unavailable' &&
    typeof fx.asOf === 'string' &&
    withinBounds(fx.rate, KRW_USDT_SANITY_BOUNDS)
  );
}

function validTicker(
  ticker: DerivativeTicker | undefined,
  instrument: Instrument,
): ticker is DerivativeTicker & { price: number; asOf: string } {
  return (
    ticker !== undefined &&
    ticker.freshness !== 'unavailable' &&
    typeof ticker.asOf === 'string' &&
    withinBounds(ticker.price, instrument.priceSanityBounds)
  );
}

export function composeDerivedQuotes(
  tickers: DerivativeTicker[],
  fx: FxConversionInput | null,
  options: { now?: () => Date; holidays?: ReadonlySet<string> } = {},
): MarketQuote[] {
  return INSTRUMENTS
    .filter((instrument) =>
      instrument.assetClass === 'kr-stock' || instrument.assetClass === 'us-stock')
    .map((instrument) => {
      const ticker = tickers.find(
        (item) =>
          item.provider === instrument.provider &&
          item.providerSymbol === instrument.providerSymbol,
      );
      if (!validTicker(ticker, instrument))
        return createUnavailableQuote(instrument, options);

      let rate = 1;
      let asOf: string | null = ticker.asOf;
      let fxStale = false;
      let estimateInputs = [ticker.providerSymbol];
      if (instrument.assetClass === 'kr-stock') {
        if (!validFxInput(fx)) return createUnavailableQuote(instrument, options);
        rate = fx.rate;
        asOf = oldestTimestamp(ticker.asOf, fx.asOf);
        fxStale = fx.freshness === 'stale';
        estimateInputs = [ticker.providerSymbol, fx.providerSymbol];
      }
      if (asOf === null) return createUnavailableQuote(instrument, options);

      const changeRate =
        ticker.changeRate !== null && Number.isFinite(ticker.changeRate)
          ? ticker.changeRate
          : null;
      const tradingAmount =
        ticker.tradingAmount !== null && Number.isFinite(ticker.tradingAmount)
          ? ticker.tradingAmount * rate
          : null;
      const stale =
        ticker.freshness === 'stale' || fxStale;

      return {
        symbol: instrument.symbol,
        name: instrument.name,
        nameKo: instrument.nameKo,
        nameEn: instrument.nameEn,
        assetClass: instrument.assetClass,
        price: ticker.price * rate,
        currency: instrument.currency,
        changeRate,
        previousClose: null,
        changeRateSource: changeRate === null ? null : 'provider',
        tradingAmount,
        tradingAmountCurrency:
          instrument.assetClass === 'kr-stock'
            ? 'KRW'
            : ticker.tradingAmountCurrency,
        volumeKind: 'derivative-notional',
        asOf,
        session: instrument.assetClass === 'kr-stock'
          ? resolveKrMarketSession(options.now?.() ?? new Date(), options.holidays)
          : 'always-open',
        quality: stale ? 'stale' : 'estimated',
        provider: ticker.provider,
        providerSymbol: ticker.providerSymbol,
        confidence: null,
        estimateInputs,
        priceKind: 'derived-estimate',
        comparisonBasis: 'provider-24h',
        sourceLabel: sourceLabels[ticker.provider],
      } satisfies MarketQuote;
    });
}
