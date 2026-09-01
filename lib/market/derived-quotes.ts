import { INSTRUMENTS } from './catalog';
import type { DerivativeTicker, Instrument, MarketProvider, MarketQuote } from './types';

const sourceLabels: Record<MarketProvider, string> = {
  hyperliquid: 'Hyperliquid 파생상품',
  'binance-futures': 'Binance 무기한선물',
  'binance-spot': 'Binance 현물',
  bithumb: 'Bithumb',
};

function hasFinitePrice(ticker: DerivativeTicker | undefined): ticker is DerivativeTicker & { price: number } {
  return ticker !== undefined && ticker.price !== null && Number.isFinite(ticker.price) && ticker.price > 0;
}

function createUnavailableQuote(instrument: Instrument): MarketQuote {
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
    asOf: null,
    session: 'always-open',
    quality: 'unavailable',
    provider: instrument.provider,
    confidence: null,
    estimateInputs: [],
    priceKind: 'unavailable',
    comparisonBasis: null,
    sourceLabel: sourceLabels[instrument.provider],
  };
}

export function composeDerivedQuotes(tickers: DerivativeTicker[], krwPerUsdt: number | null): MarketQuote[] {
  return INSTRUMENTS
    .filter((instrument) => instrument.assetClass === 'kr-stock' || instrument.assetClass === 'us-stock')
    .map((instrument) => {
      const ticker = tickers.find((item) => item.provider === instrument.provider && item.providerSymbol === instrument.providerSymbol);
      const exchangeRateAvailable = instrument.assetClass === 'us-stock'
        || (krwPerUsdt !== null && Number.isFinite(krwPerUsdt) && krwPerUsdt > 0);
      if (!hasFinitePrice(ticker) || !exchangeRateAvailable) return createUnavailableQuote(instrument);

      const changeRate = ticker.changeRate !== null && Number.isFinite(ticker.changeRate) ? ticker.changeRate : null;
      return {
        symbol: instrument.symbol,
        name: instrument.name,
        nameKo: instrument.nameKo,
        nameEn: instrument.nameEn,
        assetClass: instrument.assetClass,
        price: instrument.assetClass === 'kr-stock' ? ticker.price * krwPerUsdt! : ticker.price,
        currency: instrument.currency,
        changeRate,
        previousClose: null,
        changeRateSource: changeRate === null ? null : 'provider',
        tradingAmount: ticker.tradingAmount,
        asOf: ticker.asOf,
        session: 'always-open',
        quality: 'estimated',
        provider: ticker.provider,
        confidence: null,
        estimateInputs: instrument.assetClass === 'kr-stock' ? [ticker.providerSymbol, 'KRW-USDT'] : [ticker.providerSymbol],
        priceKind: 'derived-estimate',
        comparisonBasis: 'provider-24h',
        sourceLabel: sourceLabels[ticker.provider],
      };
    });
}
