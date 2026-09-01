import { fetchToss } from '@/lib/toss-invest';
import { aggregateCandles } from '../candle-intervals';
import type { CandleInterval, CandlePoint, Instrument } from '../types';

export type TossCandleRequester = (path: string, signal: AbortSignal) => Promise<unknown>;
const MAX_UPSTREAM_PAGES = 40;
const MAX_UPSTREAM_DURATION_MS = 10_000;

type TossCandle = {
  timestamp: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
};

type TossCandleResponse = {
  result: {
    candles: TossCandle[];
    nextBefore?: string | null;
  };
};

function normalizeCandle(candle: TossCandle): CandlePoint | null {
  const time = Date.parse(candle.timestamp) / 1_000;
  const open = Number(candle.openPrice);
  const high = Number(candle.highPrice);
  const low = Number(candle.lowPrice);
  const close = Number(candle.closePrice);
  const volume = Number(candle.volume);
  if (![time, open, high, low, close, volume].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume };
}

function requestBeforeDeadline(path: string, request: TossCandleRequester, signal: AbortSignal) {
  return new Promise<unknown>((resolve, reject) => {
    const handleAbort = () => reject(signal.reason ?? new Error('Toss candle 요청 시간 제한을 초과했습니다.'));
    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener('abort', handleAbort, { once: true });
    request(path, signal).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', handleAbort);
    });
  });
}

export async function fetchTossCandles(
  instrument: Instrument,
  interval: CandleInterval,
  request: TossCandleRequester = (path, signal) => fetchToss(path, undefined, true, signal),
): Promise<CandlePoint[]> {
  const settings: Record<CandleInterval, { sourceInterval: '1m' | '1d'; targetCount: number }> = {
    '1m': { sourceInterval: '1m', targetCount: 120 },
    '15m': { sourceInterval: '1m', targetCount: 600 },
    '1h': { sourceInterval: '1m', targetCount: 2_000 },
    '4h': { sourceInterval: '1m', targetCount: 8_000 },
    '1d': { sourceInterval: '1d', targetCount: 130 },
    '1w': { sourceInterval: '1d', targetCount: 520 },
    '1M': { sourceInterval: '1d', targetCount: 2_640 },
  };
  const { sourceInterval, targetCount } = settings[interval];
  const pageCount = Math.min(Math.ceil(targetCount / 200), MAX_UPSTREAM_PAGES);
  const candles: CandlePoint[] = [];
  let before: string | null = null;
  const deadlineController = new AbortController();
  const deadline = setTimeout(() => {
    deadlineController.abort(new Error('Toss candle 요청 시간 제한을 초과했습니다.'));
  }, MAX_UPSTREAM_DURATION_MS);

  try {
    for (let page = 0; page < pageCount && candles.length < targetCount; page += 1) {
      const params = new URLSearchParams({
        interval: sourceInterval,
        count: String(Math.min(200, targetCount - candles.length)),
      });
      if (instrument.symbol !== 'KOSPI') params.set('symbol', instrument.providerSymbol);
      if (before) params.set('before', before);
      const endpoint = instrument.symbol === 'KOSPI'
        ? `/api/v1/market-indicators/${instrument.providerSymbol}/candles?${params.toString()}`
        : `/api/v1/candles?${params.toString()}`;
      const response = await requestBeforeDeadline(endpoint, request, deadlineController.signal) as TossCandleResponse;
      candles.push(...response.result.candles.flatMap((candle) => {
        const normalized = normalizeCandle(candle);
        return normalized ? [normalized] : [];
      }));
      before = response.result.nextBefore ?? null;
      if (!before) break;
    }

    const normalized = [...new Map(candles.map((candle) => [candle.time, candle])).values()]
      .sort((a, b) => a.time - b.time)
      .slice(-targetCount);
    if (before && normalized.length < targetCount) {
      throw new Error('Toss candle 전체 조회를 완료하지 못했습니다.');
    }
    const aggregated = aggregateCandles(normalized, interval, instrument.currency === 'USD' ? 'America/New_York' : 'Asia/Seoul');
    return before && interval !== '1m' && interval !== '1d' ? aggregated.slice(1) : aggregated;
  } finally {
    clearTimeout(deadline);
  }
}
