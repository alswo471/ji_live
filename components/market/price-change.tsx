import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

export function PriceChange({ value, className = '' }: { value: number | null; className?: string }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className={`inline-flex items-center gap-1 text-muted-foreground ${className}`}><Minus aria-hidden="true" className="size-3.5" />집계 중</span>;
  }
  const percent = value * 100;
  const directionClass = value > 0 ? 'text-rise' : value < 0 ? 'text-fall' : 'text-muted-foreground';
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  const label = `${percent > 0 ? '+' : ''}${percent.toFixed(2)}%`;
  return <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${directionClass} ${className}`} aria-label={`${value > 0 ? '상승' : value < 0 ? '하락' : '보합'} ${label}`}><Icon aria-hidden="true" className="size-3.5" />{label}</span>;
}
