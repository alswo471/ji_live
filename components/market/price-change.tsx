import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ChangeDirection } from '@/lib/market/types';

export function PriceChange({ value, direction = null, className = '' }: { value: number | null; direction?: ChangeDirection | null; className?: string }) {
  if (value === null || !Number.isFinite(value)) {
    if (direction) {
      const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
      const label = direction === 'up' ? '상승' : direction === 'down' ? '하락' : '보합';
      const directionClass = direction === 'up' ? 'text-rise' : direction === 'down' ? 'text-fall' : 'text-muted-foreground';
      return <span className={`inline-flex flex-col items-end ${className}`}>
        <span className={`inline-flex items-center gap-1 font-semibold ${directionClass}`}><Icon aria-hidden="true" className="size-3.5" />{label}</span>
        <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">등락폭 미제공</span>
      </span>;
    }
    return <span className={`inline-flex items-center gap-1 text-muted-foreground ${className}`}><Minus aria-hidden="true" className="size-3.5" />집계 중</span>;
  }
  const percent = value * 100;
  const directionClass = value > 0 ? 'text-rise' : value < 0 ? 'text-fall' : 'text-muted-foreground';
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  const label = `${percent > 0 ? '+' : ''}${percent.toFixed(2)}%`;
  return <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${directionClass} ${className}`} aria-label={`${value > 0 ? '상승' : value < 0 ? '하락' : '보합'} ${label}`}><Icon aria-hidden="true" className="size-3.5" />{label}</span>;
}
