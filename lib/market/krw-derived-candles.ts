import type { CandleInterval, CandlePoint } from './types';

const DEFAULT_MAX_FX_LAG_SECONDS: Record<CandleInterval, number> = {
  '1m': 60,
  '15m': 15 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
  '1w': 7 * 24 * 60 * 60,
  '1M': 32 * 24 * 60 * 60,
};

function validCandle(candle: CandlePoint) {
  return [
    candle.time,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume,
  ].every(Number.isFinite) &&
    candle.open > 0 &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.close > 0 &&
    candle.volume >= 0;
}

export function composeKrwDerivedCandles(
  derivative: CandlePoint[],
  fx: CandlePoint[],
  interval: CandleInterval,
  options: { maxFxLagSeconds?: number } = {},
): CandlePoint[] {
  const maxFxLagSeconds =
    options.maxFxLagSeconds ?? DEFAULT_MAX_FX_LAG_SECONDS[interval];
  const fxCandles = fx.filter(validCandle).sort((a, b) => a.time - b.time);
  let fxIndex = 0;
  let latestFx: CandlePoint | null = null;

  return derivative
    .filter(validCandle)
    .sort((a, b) => a.time - b.time)
    .flatMap((candle) => {
      while (
        fxIndex < fxCandles.length &&
        fxCandles[fxIndex].time <= candle.time
      ) {
        latestFx = fxCandles[fxIndex];
        fxIndex += 1;
      }
      if (
        latestFx === null ||
        candle.time - latestFx.time > maxFxLagSeconds
      ) {
        return [];
      }

      const open = Math.round(candle.open * latestFx.open);
      const close = Math.round(candle.close * latestFx.close);
      const combinations = [
        candle.high * latestFx.high,
        candle.high * latestFx.low,
        candle.low * latestFx.high,
        candle.low * latestFx.low,
      ];
      const high = Math.round(Math.max(...combinations));
      const low = Math.round(Math.min(...combinations));
      if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0))
        return [];

      return [{
        time: candle.time,
        open,
        high,
        low,
        close,
        volume: candle.volume,
      }];
    });
}
