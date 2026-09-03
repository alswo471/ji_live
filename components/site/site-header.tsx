'use client';

import Link from 'next/link';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { DisplayControls } from '@/components/market/display-controls';
import { Button } from '@/components/ui/button';
import { useDisplayPreferences } from '@/hooks/use-display-preferences';

export function SiteHeader({
  current,
  refreshing = false,
  onRefresh,
}: {
  current: 'market' | 'community';
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const preferences = useDisplayPreferences();
  const communityEnabled = process.env.NEXT_PUBLIC_COMMUNITY_ENABLED === 'true';
  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          aria-label="지투라이브 마켓 홈"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <TrendingUp aria-hidden="true" className="size-5" />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold tracking-[.2em] text-primary">
            G2 LIVE
          </p>
          <p className="truncate text-lg font-black tracking-[-.04em]">
            지투라이브
          </p>
        </div>
        <nav
          aria-label="주요 메뉴"
          className="ml-2 hidden items-center gap-1 sm:flex"
        >
          <Link
            href="/"
            aria-current={current === 'market' ? 'page' : undefined}
            className="min-h-11 rounded-lg px-3 py-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
          >
            마켓
          </Link>
          {communityEnabled && (
            <Link
              href="/community"
              aria-current={current === 'community' ? 'page' : undefined}
              className="min-h-11 rounded-lg px-3 py-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
            >
              커뮤니티
            </Link>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <DisplayControls {...preferences} />
        {onRefresh && (
          <Button
            variant="outline"
            size="icon"
            className="hidden size-11 rounded-xl bg-card/60 sm:inline-flex"
            onClick={onRefresh}
            aria-label="데이터 새로고침림"
          >
            <RefreshCw
              aria-hidden="true"
              className={refreshing ? 'animate-spin' : ''}
            />
          </Button>
        )}
      </div>
    </div>
  );
}
