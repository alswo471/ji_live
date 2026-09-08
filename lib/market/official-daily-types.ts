export type OfficialDailyKind = 'stock' | 'indices' | 'etf';
export type OfficialDailyRow = {
  symbol: string;
  name: string;
  date: string;
  close: number;
  changeRate: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
};
export type OfficialDaily = {
  kind: OfficialDailyKind;
  date: string | null;
  rows: OfficialDailyRow[];
  stale: boolean;
};
