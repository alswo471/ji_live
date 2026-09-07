import { createCachedProvider } from './cache';

const MAX_AGE_MS = 10 * 24 * 60 * 60_000;
const CURRENCIES = ['USD', 'JPY', 'THB'] as const;
export type ReferenceFx = {
  via?: 'ecb' | 'frankfurter';
  date: string;
  previousDate: string | null;
  rates: {
    currency: (typeof CURRENCIES)[number];
    unit: number;
    price: number;
    previousPrice: number | null;
    changeRate: number | null;
  }[];
};

export function parseReferenceFx(xml: string, now = Date.now()): ReferenceFx {
  // Parse only ECB's observed Cube feed grammar; never resolve XML entities or external resources.
  if (xml.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error('Invalid ECB feed');
  const days = Array.from(
    xml.matchAll(
      /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g,
    ),
    ([, date, content]) => {
      const timestamp = Date.parse(date + 'T00:00:00Z');
      if (
        !Number.isFinite(timestamp) ||
        new Date(timestamp).toISOString().slice(0, 10) !== date ||
        date > new Date(now).toISOString().slice(0, 10)
      )
        throw new Error('Invalid ECB date');
      const rates: Record<string, number> = {};
      for (const [, currency, value] of content.matchAll(
        /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([^'"]*)['"]\s*\/>/g,
      )) {
        if (
          currency in rates ||
          !/^\d+(?:\.\d+)?$/.test(value) ||
          !Number.isFinite(Number(value)) ||
          Number(value) <= 0
        )
          throw new Error('Invalid ECB rate');
        rates[currency] = Number(value);
      }
      if (['KRW', ...CURRENCIES].some((currency) => !rates[currency]))
        throw new Error('Incomplete ECB date');
      return { date, timestamp, rates };
    },
  );
  return calculateReferenceFx(days, now);
}

function calculateReferenceFx(
  days: { date: string; timestamp: number; rates: Record<string, number> }[],
  now: number,
): ReferenceFx {
  days.sort((a, b) => b.date.localeCompare(a.date));
  if (
    !days.length ||
    new Set(days.map((day) => day.date)).size !== days.length ||
    now - days[0].timestamp > MAX_AGE_MS
  )
    throw new Error('Expired or missing ECB data');
  const [latest, previous] = days;
  return {
    date: latest.date,
    previousDate: previous?.date ?? null,
    rates: CURRENCIES.map((currency) => {
      const unit = currency === 'JPY' ? 100 : 1;
      const price = (latest.rates.KRW / latest.rates[currency]) * unit;
      const previousPrice = previous
        ? (previous.rates.KRW / previous.rates[currency]) * unit
        : null;
      const changeRate =
        previousPrice === null ? null : price / previousPrice - 1;
      if (
        !Number.isFinite(price) ||
        price <= 0 ||
        (previousPrice !== null &&
          (!Number.isFinite(previousPrice) || previousPrice <= 0)) ||
        (changeRate !== null && !Number.isFinite(changeRate))
      )
        throw new Error('Invalid cross rate');
      return { currency, unit, price, previousPrice, changeRate };
    }),
  };
}

export function parseFrankfurterFx(
  payload: unknown,
  now = Date.now(),
): ReferenceFx {
  if (!Array.isArray(payload) || !payload.length || payload.length > 1000)
    throw new Error('Invalid Frankfurter feed');
  const groups = new Map<
    string,
    { date: string; timestamp: number; rates: Record<string, number> }
  >();
  for (const row of payload) {
    if (
      !row ||
      row.base !== 'EUR' ||
      typeof row.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !['KRW', ...CURRENCIES].includes(row.quote) ||
      typeof row.rate !== 'number' ||
      !Number.isFinite(row.rate) ||
      row.rate <= 0
    )
      throw new Error('Invalid Frankfurter rate');
    const timestamp = Date.parse(row.date + 'T00:00:00Z');
    if (
      !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== row.date ||
      row.date > new Date(now).toISOString().slice(0, 10)
    )
      throw new Error('Invalid Frankfurter date');
    const group: { date: string; timestamp: number; rates: Record<string, number> } = groups.get(row.date) ?? {
      date: row.date,
      timestamp,
      rates: {},
    };
    if (row.quote in group.rates) throw new Error('Duplicate rate');
    group.rates[row.quote] = row.rate;
    groups.set(row.date, group);
  }
  const days = [...groups.values()];
  if (
    days.some((day) =>
      ['KRW', ...CURRENCIES].some((currency) => !day.rates[currency]),
    )
  )
    throw new Error('Incomplete Frankfurter date');
  return calculateReferenceFx(days, now);
}

const provider = createCachedProvider({
  ttlMs: 60 * 60_000,
  failureThreshold: 1,
  cooldownMs: 60_000,
  load: async () => {
    try {
      const response = await fetch(
        'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml',
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!response.ok) throw new Error('ECB unavailable');
      return {
        ...parseReferenceFx(await response.text()),
        via: 'ecb' as const,
      };
    } catch {
      const from = new Date(Date.now() - 14 * 24 * 60 * 60_000)
        .toISOString()
        .slice(0, 10);
      const response = await fetch(
        `https://api.frankfurter.dev/v2/rates?base=EUR&quotes=KRW,USD,JPY,THB&providers=ECB&from=${from}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!response.ok) throw new Error('ECB fallback unavailable');
      return {
        ...parseFrankfurterFx(await response.json()),
        via: 'frankfurter' as const,
      };
    }
  },
});

export async function getReferenceFx() {
  const result = await provider.get();
  if (Date.now() - Date.parse(result.value.date + 'T00:00:00Z') > MAX_AGE_MS)
    throw new Error('ECB expired');
  return { ...result.value, stale: result.stale };
}
