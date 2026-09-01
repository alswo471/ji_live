import { PROXY_MAP } from './proxy-map';
import type { MarketQuote } from './types';

type EstimateInput = { symbol: string; changeRate: number | null; weight: number };
type EstimateRule = { minimumWeight: number };

export function estimateQuote(base: MarketQuote, inputs: EstimateInput[], rule: EstimateRule): MarketQuote | null {
  if (base.price === null || base.session !== 'closed') return null;
  const validInputs = inputs.filter((input) => input.changeRate !== null && Number.isFinite(input.changeRate) && input.weight > 0);
  const availableWeight = validInputs.reduce((sum, input) => sum + input.weight, 0);
  if (availableWeight < rule.minimumWeight) return null;

  const estimatedReturn = validInputs.reduce((sum, input) => sum + input.changeRate! * input.weight, 0);
  const confidence = validInputs.length >= 3 ? 'high' : validInputs.length === 2 ? 'medium' : 'low';
  return {
    ...base,
    price: base.price * (1 + estimatedReturn),
    changeRate: estimatedReturn,
    quality: 'estimated',
    confidence,
    estimateInputs: validInputs.map((input) => input.symbol),
  };
}

export function applyEstimates(quotes: MarketQuote[]) {
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  return quotes.map((quote) => {
    if (quote.assetClass !== 'kr-stock' || quote.session !== 'closed') return quote;
    const rule = PROXY_MAP[quote.symbol];
    if (!rule) return quote;
    const inputs = rule.inputs.map((input) => ({ ...input, changeRate: quoteMap.get(input.symbol)?.changeRate ?? null }));
    return estimateQuote(quote, inputs, rule) ?? quote;
  });
}
