'use client';

import Link from 'next/link';
import Image from 'next/image';
import { RefreshCw } from 'lucide-react';
import { DisplayControls } from '@/components/market/display-controls';
import { Button } from '@/components/ui/button';
import { useDisplayPreferences } from '@/hooks/use-display-preferences';
import { MARKET_SECTIONS, type MarketSection } from '@/lib/market/navigation';

export function SiteHeader({
  current,
  refreshing = false,
  onRefresh,
  marketSection,
}: {
  current: 'market' | 'community' | 'indicators';
  refreshing?: boolean;
  onRefresh?: () => void;
  marketSection?: MarketSection;
}) {
  const preferences = useDisplayPreferences();
  const communityEnabled = process.env.NEXT_PUBLIC_COMMUNITY_ENABLED === 'true';
  return (
    <div>
      <div className="flex min-h-20 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            aria-label="지투라이브 마켓 홈"
            className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Image
              src="/brand/g2-b2.png"
              alt=""
              width={48}
              height={48}
              unoptimized
              className="size-full object-cover"
            />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold tracking-[.2em] text-primary">
              G2 LIVE
            </p>
            <p className="truncate text-lg font-black tracking-[-.04em]">
              지투라이브
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DisplayControls {...preferences} />
          {onRefresh && (
            <Button
              variant="outline"
              size="icon"
              className="hidden size-11 rounded-xl bg-card/60 sm:inline-flex"
              onClick={onRefresh}
              aria-label="데이터 새로고침"
            >
              <RefreshCw
                aria-hidden="true"
                className={refreshing ? 'animate-spin' : ''}
              />
            </Button>
          )}
        </div>
      </div>
      <nav
        aria-label="시장 및 커뮤니티"
        className="flex flex-wrap gap-x-1 border-t border-border px-3 sm:px-5 lg:px-7"
      >
        {MARKET_SECTIONS.map((section) => (
          <a
            key={section.value}
            href={`/?market=${section.value}`}
            aria-current={
              current === 'market' && marketSection === section.value
                ? 'page'
                : undefined
            }
            className="flex min-h-11 items-center gap-1 border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:border-primary aria-[current=page]:text-primary"
          >
            {section.label}
            {section.value === 'news' && (
              <span className="rounded bg-muted px-1 text-[10px] font-normal">
                준비
              </span>
            )}
          </a>
        ))}
        <Link
          href="/indicators"
          aria-current={current === 'indicators' ? 'page' : undefined}
          className="flex min-h-11 items-center border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:border-primary aria-[current=page]:text-primary"
        >
          시장 지표
        </Link>
        {communityEnabled && (
          <Link
            href="/community"
            aria-current={current === 'community' ? 'page' : undefined}
            className="flex min-h-11 items-center border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:border-primary aria-[current=page]:text-primary"
          >
            커뮤니티
          </Link>
        )}
      </nav>
    </div>
  );
}
