import type { KrMarketSession } from './types';

const CONFIRMED_KR_MARKET_HOLIDAYS: Record<string, ReadonlySet<string>> = {
  '2026': new Set([
    '2026-01-01',
    '2026-02-16',
    '2026-02-17',
    '2026-02-18',
    '2026-03-01',
    '2026-03-02',
    '2026-05-01',
    '2026-05-05',
    '2026-05-24',
    '2026-05-25',
    '2026-06-03',
    '2026-06-06',
    '2026-07-17',
    '2026-08-15',
    '2026-08-17',
    '2026-09-24',
    '2026-09-25',
    '2026-09-26',
    '2026-10-03',
    '2026-10-05',
    '2026-10-09',
    '2026-12-25',
    '2026-12-31',
  ]),
};

export const KR_MARKET_SESSION_LABELS: Record<KrMarketSession, string> = {
  overnight: '야간 추정',
  'nxt-pre': '프리마켓 추정',
  'krx-opening-auction': '시가 형성 중',
  'krx-regular': '정규장 추정',
  'krx-nxt-overlap': '정규장 추정',
  'krx-closing-auction': '종가 형성 중',
  'nxt-transition': '애프터 전환 중',
  'nxt-after': '애프터마켓 추정',
  closed: '휴장 중 추정',
};

function kstParts(at: Date) {
  if (!Number.isFinite(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: values.year,
    date: `${values.year}-${values.month}-${values.day}`,
    weekday: values.weekday,
    seconds:
      Number(values.hour) * 3_600 +
      Number(values.minute) * 60 +
      Number(values.second),
  };
}

export function resolveKrMarketSession(
  at: Date,
  holidays?: ReadonlySet<string>,
): KrMarketSession {
  const parts = kstParts(at);
  const confirmedHolidays = parts === null
    ? undefined
    : holidays ?? CONFIRMED_KR_MARKET_HOLIDAYS[parts.year];
  if (
    parts === null ||
    confirmedHolidays === undefined ||
    parts.weekday === 'Sat' ||
    parts.weekday === 'Sun' ||
    confirmedHolidays.has(parts.date)
  ) {
    return 'closed';
  }

  const { seconds } = parts;
  if (seconds < 8 * 3_600) return 'overnight';
  if (seconds < 8 * 3_600 + 50 * 60) return 'nxt-pre';
  if (seconds < 9 * 3_600) return 'krx-opening-auction';
  if (seconds < 9 * 3_600 + 30) return 'krx-regular';
  if (seconds < 15 * 3_600 + 20 * 60) return 'krx-nxt-overlap';
  if (seconds < 15 * 3_600 + 30 * 60) return 'krx-closing-auction';
  if (seconds < 15 * 3_600 + 40 * 60) return 'nxt-transition';
  if (seconds < 20 * 3_600) return 'nxt-after';
  return 'closed';
}
