import type { DerivativeTicker } from '../types';
import { createProviderRequestError } from '../provider-error';

const DEFAULT_SYMBOLS = ['xyz:SMSN', 'xyz:SKHX', 'xyz:HYUNDAI'];
const ENDPOINT = 'https://api.hyperliquid.xyz/info';

type HyperliquidAsset = { name?: unknown };
type HyperliquidAssetCtx = {
  markPx?: unknown;
  prevDayPx?: unknown;
  dayNtlVlm?: unknown;
};

function finitePositive(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function fetchHyperliquidTickers(
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
  symbols = DEFAULT_SYMBOLS,
): Promise<DerivativeTicker[]> {
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }),
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok)
    throw createProviderRequestError('Hyperliquid', response, now().getTime());

  const [meta, contexts] = (await response.json()) as [
    { universe?: HyperliquidAsset[] },
    HyperliquidAssetCtx[],
  ];
  const contextsBySymbol = new Map<string, HyperliquidAssetCtx | undefined>();
  if (Array.isArray(meta?.universe) && Array.isArray(contexts)) {
    meta.universe.forEach((asset, index) => {
      if (typeof asset?.name === 'string')
        contextsBySymbol.set(asset.name, contexts[index]);
    });
  }

  const asOf = now().toISOString();
  return symbols.map((providerSymbol) => {
    const context = contextsBySymbol.get(providerSymbol);
    const price = finitePositive(context?.markPx);
    const previousPrice = finitePositive(context?.prevDayPx);
    return {
      provider: 'hyperliquid',
      providerSymbol,
      price,
      changeRate:
        price === null || previousPrice === null
          ? null
          : price / previousPrice - 1,
      tradingAmount: finitePositive(context?.dayNtlVlm),
      tradingAmountCurrency: 'USD',
      asOf,
      freshness: price === null ? 'unavailable' : 'fresh',
    } satisfies DerivativeTicker;
  });
}
