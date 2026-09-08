import Link from 'next/link';
import {
  Ban,
  ClipboardList,
  EyeOff,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

import type { AdminSummary as Summary } from '@/lib/community/admin-console-service';

const CARDS: Array<{
  key: keyof Summary;
  label: string;
  tab: 'reports' | 'hidden' | 'trash' | 'sanctions';
  icon: LucideIcon;
}> = [
  { key: 'reports', label: '신고 대기', tab: 'reports', icon: ClipboardList },
  { key: 'hidden', label: '숨김 콘텐츠', tab: 'hidden', icon: EyeOff },
  { key: 'trash', label: '삭제 대기', tab: 'trash', icon: Trash2 },
  { key: 'sanctions', label: '활성 제재', tab: 'sanctions', icon: Ban },
];

export function AdminSummary({ summary }: { summary: Summary | null }) {
  return (
    <section aria-label="운영 현황">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const count = summary?.[card.key];

          return (
            <Link
              key={card.key}
              href={`/admin/community?tab=${card.tab}`}
              aria-label={
                count === undefined
                  ? `${card.label} 건수 불러오는 중`
                  : `${card.label} ${count.toLocaleString('ko-KR')}건 보기`
              }
              className="group min-w-0 rounded-xl border bg-card p-4 outline-none transition-colors hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Icon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-primary"
                />
                <span className="truncate">{card.label}</span>
              </div>
              <p className="mt-3 min-h-9 text-2xl font-black tracking-tight text-foreground">
                {count === undefined ? '—' : count.toLocaleString('ko-KR')}
                <span className="ml-1 text-sm font-semibold text-muted-foreground">
                  건
                </span>
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
