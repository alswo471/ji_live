import { createCachedProvider } from './cache';

export type BitcoinSentiment = {
  value: number;
  classification: string;
  asOf: string;
};
const CLASSIFICATIONS = [
  'Extreme Fear',
  'Fear',
  'Neutral',
  'Greed',
  'Extreme Greed',
];

export function parseSentiment(
  payload: unknown,
  now = Date.now(),
): BitcoinSentiment {
  if (!payload || typeof payload !== 'object')
    throw new Error('Invalid sentiment');
  const body = payload as { data?: unknown[]; metadata?: { error?: unknown } };
  const row = body.data?.[0] as Record<string, unknown> | undefined;
  if (
    body.metadata?.error ||
    !row ||
    typeof row.value !== 'string' ||
    !/^\d{1,3}$/.test(row.value)
  )
    throw new Error('Invalid sentiment');
  const value = Number(row.value);
  const timestamp =
    typeof row.timestamp === 'string' && /^\d+$/.test(row.timestamp)
      ? Number(row.timestamp) * 1000
      : NaN;
  if (
    value > 100 ||
    !Number.isFinite(timestamp) ||
    timestamp > now + 60_000 ||
    now - timestamp > 72 * 60 * 60_000 ||
    typeof row.value_classification !== 'string' ||
    !CLASSIFICATIONS.includes(row.value_classification)
  )
    throw new Error('Invalid sentiment');
  return {
    value,
    classification: row.value_classification,
    asOf: new Date(timestamp).toISOString(),
  };
}

const provider = createCachedProvider({
  ttlMs: 60 * 60_000,
  failureThreshold: 1,
  cooldownMs: 60_000,
  load: async () => {
    const response = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('Sentiment unavailable');
    return parseSentiment(await response.json());
  },
});

export async function getSentiment() {
  const result = await provider.get();
  if (Date.now() - Date.parse(result.value.asOf) > 72 * 60 * 60_000)
    throw new Error('Sentiment expired');
  return { ...result.value, stale: result.stale };
}
