import { Radio } from 'lucide-react';

export function MarketStatusBar({ state, fetchedAt }: { state: 'loading' | 'ready' | 'stale' | 'error'; fetchedAt?: string }) {
  const label = state === 'ready' ? '시장 데이터 연결됨' : state === 'stale' ? '마지막 정상 데이터 표시 중' : state === 'error' ? '시장 데이터 연결 재시도 중' : '시장 데이터 불러오는 중';
  const color = state === 'ready' ? 'bg-emerald-400' : state === 'error' ? 'bg-red-400' : 'bg-amber-400';
  return <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-white/8 px-4 py-2 text-xs text-muted-foreground sm:px-6 lg:px-8" aria-live="polite"><span className="flex items-center gap-2"><span className={`size-2 rounded-full ${color}`} /><Radio className="size-3.5" />{label}</span><span className="font-mono">{fetchedAt ? `${new Date(fetchedAt).toLocaleTimeString('ko-KR')} · 5초 갱신` : '5초 자동 갱신'}</span></div>;
}
