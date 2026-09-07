'use client';

import { useEffect, useState } from 'react';
import type {
  OfficialDaily,
  OfficialDailyKind,
  OfficialDailyRow,
} from '@/lib/market/official-daily-types';
import { PriceChange } from './price-change';

type Props = { kind: OfficialDailyKind; symbol?: string };
const TITLES = {
  stock: '공식 일별 기록',
  indices: '국내 주가지수 · 일별',
  etf: '국내 ETF · 거래량 TOP 10',
};
const number = (value: number | null, unit = '') =>
  value === null
    ? '미제공'
    : new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(
        value,
      ) + unit;
function Change({ value }: { value: number | null }) {
  return value === null ? (
    <span className="text-muted-foreground">미제공</span>
  ) : (
    <PriceChange value={value} />
  );
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return (
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value &&
    value <= new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
  );
}
function valid(value: OfficialDaily, props: Props) {
  return (
    value?.kind === props.kind &&
    typeof value.stale === 'boolean' &&
    Array.isArray(value.rows) &&
    value.rows.length <= 100 &&
    (value.rows.length ? validDate(value.date) : value.date === null) &&
    value.rows.every(
      (r) =>
        r &&
        typeof r.symbol === 'string' &&
        typeof r.name === 'string' &&
        validDate(r.date) &&
        r.close > 0 &&
        Number.isFinite(r.close) &&
        [r.changeRate, r.open, r.high, r.low, r.volume].every(
          (n) => n === null || (typeof n === 'number' && Number.isFinite(n)),
        ) &&
        (props.kind !== 'stock' || r.symbol === props.symbol),
    )
  );
}

export function OfficialDailyPanel(props: Props) {
  return <DailyPanel key={`${props.kind}:${props.symbol ?? ''}`} {...props} />;
}
function DailyPanel({ kind, symbol }: Props) {
  const [data, setData] = useState<OfficialDaily | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      setLoading(true);
      setCheckedAt(Date.now());
      try {
        const query = new URLSearchParams({
          kind,
          ...(symbol ? { symbol } : {}),
        });
        const response = await fetch('/api/market/official-daily?' + query, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(40_000),
          ]),
        });
        const result = (await response.json()) as OfficialDaily & {
          code?: string;
        };
        if (!response.ok)
          throw new Error(
            result?.code === 'NOT_CONFIGURED'
              ? 'NOT_CONFIGURED'
              : 'UNAVAILABLE',
          );
        if (!valid(result, { kind, symbol })) throw new Error('UNAVAILABLE');
        if (!controller.signal.aborted) {
          setData(result);
          setFailure(null);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setFailure(
            error instanceof Error && error.message === 'NOT_CONFIGURED'
              ? '연동 준비 중'
              : '불러오지 못했습니다',
          );
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 300_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [kind, symbol, retry]);
  const oldest = new Date(checkedAt + 9 * 3_600_000 - 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const latestBySymbol = new Map<string, string>();
  for (const row of data?.rows ?? []) {
    const previous = latestBySymbol.get(row.symbol) ?? '';
    latestBySymbol.set(row.symbol, row.date > previous ? row.date : previous);
  }
  const expired = [...latestBySymbol.values()].some((date) => date < oldest);
  const usable = expired ? null : data;
  const rows = usable?.rows ?? [];
  const latest = rows[0];
  return (
    <section
      aria-label={TITLES[kind]}
      className="rounded-2xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{TITLES[kind]}</h2>
        {usable?.date && (
          <p className="text-xs font-medium text-muted-foreground">
            {usable.date} 기준 · 일별
          </p>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        공식 일별 종가이며 실시간 시세가 아닙니다. 등락률은 해당 기준일의 전일
        대비입니다.
      </p>
      {(failure || data?.stale || (data && !usable)) && (
        <output className="mt-3 block text-sm text-amber-700 dark:text-amber-300">
          {rows.length
            ? '갱신 지연 · 이전 제공값입니다.'
            : (failure ?? '기준일이 오래되어 표시를 중단했습니다.')}
        </output>
      )}
      {!data && loading && (
        <output className="block py-6 text-sm text-muted-foreground">
          불러오는 중…
        </output>
      )}
      {usable && !rows.length && (
        <p className="py-6 text-sm text-muted-foreground">제공 데이터 없음</p>
      )}
      {kind === 'indices' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {['코스피', '코스닥'].map((name) => {
            const row = rows.find((r) => r.name === name);
            return (
              <article key={name} className="rounded-xl border bg-muted/20 p-4">
                <h3 className="text-sm font-semibold">{name}</h3>
                {row ? (
                  <>
                    <p className="mt-2 text-2xl font-bold tabular-nums">
                      {number(row.close)}
                    </p>
                    <Change value={row.changeRate} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {row.date} 기준
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {loading ? '불러오는 중…' : '제공 데이터 없음'}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
      {kind === 'stock' && latest && (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">종가</dt>
              <dd className="mt-2 font-bold tabular-nums">
                {number(latest.close, '원')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">전일 대비</dt>
              <dd className="mt-2">
                <Change value={latest.changeRate} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">거래량</dt>
              <dd className="mt-2 font-bold tabular-nums">
                {number(latest.volume, '주')}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="mt-4 min-h-11 rounded-lg px-3 text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded ? '과거 기록 접기' : '과거 기록 보기'}
          </button>
          {expanded && (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                최근 90일 중 제공된 거래일만 표시합니다.
              </p>
              <DailyTable rows={rows} history />
            </>
          )}
        </>
      )}
      {kind === 'etf' && rows.length > 0 && <DailyTable rows={rows} />}
      <button
        type="button"
        disabled={loading}
        onClick={() => setRetry((n) => n + 1)}
        className="mt-3 min-h-11 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        다시 불러오기
      </button>
    </section>
  );
}

function DailyTable({
  rows,
  history = false,
}: {
  rows: OfficialDailyRow[];
  history?: boolean;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table
        aria-label={history ? '공식 일별 과거 기록' : '국내 ETF 거래량 순위'}
        className="w-full text-right text-sm tabular-nums"
      >
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-3 text-left">
              {history ? '날짜' : '종목'}
            </th>
            <th scope="col" className="px-2">
              종가
            </th>
            <th scope="col">등락률</th>
            {history && (
              <>
                <th scope="col" className="hidden px-2 sm:table-cell">
                  시가
                </th>
                <th scope="col" className="hidden px-2 sm:table-cell">
                  고가
                </th>
                <th scope="col" className="hidden px-2 sm:table-cell">
                  저가
                </th>
              </>
            )}
            <th scope="col" className="hidden pl-2 sm:table-cell">
              거래량
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.symbol + row.date} className="border-b last:border-0">
              <th scope="row" className="max-w-48 py-4 text-left font-medium">
                {history ? (
                  row.date
                ) : (
                  <>
                    <span className="mr-2 text-muted-foreground">{i + 1}</span>
                    {row.name}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {row.symbol}
                    </span>
                  </>
                )}
              </th>
              <td className="whitespace-nowrap px-2">
                {number(row.close, '원')}
              </td>
              <td className="whitespace-nowrap">
                <Change value={row.changeRate} />
              </td>
              {history && (
                <>
                  {[row.open, row.high, row.low].map((value, j) => (
                    <td
                      key={j}
                      className="hidden whitespace-nowrap px-2 sm:table-cell"
                    >
                      {number(value)}
                    </td>
                  ))}
                </>
              )}
              <td className="hidden whitespace-nowrap pl-2 sm:table-cell">
                {number(row.volume, '주')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
