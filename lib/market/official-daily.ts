import { createCachedProvider } from './cache';
import { INSTRUMENTS } from './catalog';
import type {
  OfficialDaily,
  OfficialDailyKind,
  OfficialDailyRow,
} from './official-daily-types';

const DAY = 86_400_000;
const PATHS = {
  stock: 'GetStockSecuritiesInfoService/getStockPriceInfo',
  indices: 'GetMarketIndexInfoService/getStockMarketIndex',
  etf: 'GetSecuritiesProductInfoService/getETFPriceInfo',
};
const STOCKS = new Set(
  INSTRUMENTS.filter((i) => i.assetClass === 'kr-stock').map((i) => i.symbol),
);
type RawRow = Record<string, unknown>;
const invalid = () => new Error('공식 일별 데이터를 확인할 수 없습니다.');
function koreaDate(offset = 0) {
  return new Date(Date.now() + 9 * 3_600_000 - offset * DAY)
    .toISOString()
    .slice(0, 10);
}
function numeric(value: unknown, optional = false): number | null {
  if (optional && (value === undefined || value === null || value === ''))
    return null;
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(value))
  )
    throw invalid();
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER)
    throw invalid();
  return n;
}
function normalize(row: RawRow, kind: OfficialDailyKind): OfficialDailyRow {
  if (typeof row.basDt !== 'string' || !/^\d{8}$/.test(row.basDt))
    throw invalid();
  const date = `${row.basDt.slice(0, 4)}-${row.basDt.slice(4, 6)}-${row.basDt.slice(6)}`;
  const timestamp = Date.parse(date + 'T00:00:00Z');
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== date ||
    date > koreaDate()
  )
    throw invalid();
  const name = kind === 'indices' ? row.idxNm : row.itmsNm;
  const symbol = kind === 'indices' ? row.idxNm : row.srtnCd;
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 200 ||
    typeof symbol !== 'string' ||
    (kind !== 'indices' && !/^[A-Z0-9]{6}$/.test(symbol))
  )
    throw invalid();
  const close = numeric(row.clpr)!;
  if (close <= 0) throw invalid();
  const change = numeric(row.fltRt, true);
  const volume = numeric(row.trqu, kind !== 'etf');
  if (volume !== null && (volume < 0 || !Number.isSafeInteger(volume)))
    throw invalid();
  const prices = [row.mkp, row.hipr, row.lopr].map((v) => {
    const n = numeric(v, true);
    if (n !== null && n < 0) throw invalid();
    return n === 0 ? null : n;
  });
  const [open, high, low] = prices;
  if (
    high !== null &&
    low !== null &&
    (high < low ||
      high < close ||
      low > close ||
      (open !== null && (open < low || open > high)))
  )
    throw invalid();
  return {
    symbol,
    name,
    date,
    close,
    changeRate: change === null ? null : change / 100,
    open,
    high,
    low,
    volume,
  };
}

async function collect(
  kind: OfficialDailyKind,
  params: Record<string, string>,
): Promise<OfficialDailyRow[]> {
  const rawKey = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!rawKey) throw new Error('NOT_CONFIGURED');
  let key: string;
  try {
    key = /%[\da-f]{2}/i.test(rawKey) ? decodeURIComponent(rawKey) : rawKey;
  } catch {
    throw invalid();
  }
  const rows: OfficialDailyRow[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  let size: number | null = null;
  // Bound both pagination and elapsed time; do not return a partial ranking.
  const signal = AbortSignal.timeout(30_000);
  for (let pageNo = 1; pageNo <= 40; pageNo++) {
    const url = new URL(
      'https://apis.data.go.kr/1160100/service/' + PATHS[kind],
    );
    url.search = new URLSearchParams({
      ...params,
      serviceKey: key,
      resultType: 'json',
      numOfRows: '1000',
      pageNo: String(pageNo),
    }).toString();
    let payload;
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw invalid();
      const text = await response.text();
      if (text.length > 5_000_000) throw invalid();
      payload = JSON.parse(text);
    } catch {
      throw invalid();
    }
    if (payload?.response?.header?.resultCode !== '00') throw invalid();
    const body = payload.response.body;
    const count = Number(body?.totalCount);
    const pageSize = Number(body?.numOfRows);
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > 20_000 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 1000 ||
      Number(body?.pageNo) !== pageNo
    )
      throw invalid();
    if (
      (total !== null && count !== total) ||
      (size !== null && pageSize !== size)
    )
      throw invalid();
    total = count;
    size = pageSize;
    const items = body?.items?.item;
    const list: unknown[] = Array.isArray(items)
      ? items
      : items && typeof items === 'object'
        ? [items]
        : [];
    if (list.length !== Math.min(pageSize, count - rows.length))
      throw invalid();
    for (const item of list) {
      if (!item || typeof item !== 'object') throw invalid();
      const row = normalize(item as RawRow, kind);
      if (row.date.replaceAll('-', '') < params.beginBasDt) throw invalid();
      const id = row.symbol + ':' + row.date;
      if (seen.has(id)) throw invalid();
      seen.add(id);
      rows.push(row);
    }
    if (rows.length === count) return rows;
  }
  throw invalid();
}

async function load(kind: OfficialDailyKind, symbol?: string) {
  const beginBasDt = koreaDate(kind === 'stock' ? 90 : 14).replaceAll('-', '');
  let rows: OfficialDailyRow[];
  if (kind === 'indices') {
    rows = (
      await Promise.all(
        ['코스피', '코스닥'].map(async (idxNm) => {
          const history = await collect(kind, { beginBasDt, idxNm });
          if (history.some((r) => r.name !== idxNm)) throw invalid();
          return history
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 1);
        }),
      )
    ).flat();
  } else {
    rows = await collect(kind, {
      beginBasDt,
      ...(kind === 'stock' ? { likeSrtnCd: symbol! } : {}),
    });
    if (kind === 'stock' && rows.some((r) => r.symbol !== symbol))
      throw invalid();
    rows.sort((a, b) => b.date.localeCompare(a.date));
    if (kind === 'etf' && rows.length) {
      const date = rows[0].date;
      rows = rows
        .filter((r) => r.date === date)
        .sort(
          (a, b) => b.volume! - a.volume! || a.symbol.localeCompare(b.symbol),
        )
        .slice(0, 10);
    }
  }
  const date =
    rows
      .map((r) => r.date)
      .sort()
      .at(-1) ?? null;
  return { kind, date, rows };
}

const caches = new Map<
  string,
  ReturnType<typeof createCachedProvider<Omit<OfficialDaily, 'stale'>>>
>();
export async function getOfficialDaily(
  kind: OfficialDailyKind,
  symbol?: string,
): Promise<OfficialDaily> {
  if (
    !['stock', 'indices', 'etf'].includes(kind) ||
    (kind === 'stock' ? !STOCKS.has(symbol ?? '') : symbol !== undefined)
  )
    throw new Error('INVALID_REQUEST');
  if (!process.env.DATA_GO_KR_SERVICE_KEY?.trim())
    throw new Error('NOT_CONFIGURED');
  const id = `${kind}:${symbol ?? ''}`;
  let provider = caches.get(id);
  if (!provider) {
    provider = createCachedProvider({
      ttlMs: 3_600_000,
      failureThreshold: 1,
      cooldownMs: 60_000,
      load: () => load(kind, symbol),
    });
    caches.set(id, provider);
  }
  const result = await provider.get();
  const latestBySymbol = new Map<string, string>();
  for (const row of result.value.rows)
    latestBySymbol.set(
      row.symbol,
      [latestBySymbol.get(row.symbol) ?? '', row.date].sort().at(-1)!,
    );
  if ([...latestBySymbol.values()].some((date) => date < koreaDate(14)))
    throw invalid();
  return { ...result.value, stale: result.stale };
}
