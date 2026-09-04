'use client';

import type { KeyboardEvent } from 'react';
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  EyeOff,
  ScrollText,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { AdminTab } from '@/lib/community/admin-console-service';

const TABS: Array<{ value: AdminTab; label: string; icon: LucideIcon }> = [
  { value: 'reports', label: '신고 대기', icon: ClipboardList },
  { value: 'hidden', label: '숨김 콘텐츠', icon: EyeOff },
  { value: 'trash', label: '삭제 대기', icon: Trash2 },
  { value: 'sanctions', label: '제재 사용자', icon: Ban },
  { value: 'audit', label: '운영 로그', icon: ScrollText },
];

function moveTabFocus(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
  const nextIndex =
    event.key === 'ArrowRight'
      ? (index + 1) % TABS.length
      : event.key === 'ArrowLeft'
        ? (index - 1 + TABS.length) % TABS.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? TABS.length - 1
            : null;
  if (nextIndex === null) return;
  event.preventDefault();
  event.currentTarget.parentElement
    ?.querySelectorAll<HTMLAnchorElement>('[role="tab"]')
    [nextIndex]?.focus();
}

export function AdminConsoleNav({ tab }: { tab: AdminTab }) {
  const activeTab = TABS.find((item) => item.value === tab) ?? TABS[0];

  return (
    <section aria-label="Community 운영 화면" className="space-y-3">
      <div
        role="tablist"
        aria-label="Community 운영 메뉴"
        className="grid grid-cols-2 gap-2 rounded-2xl border bg-card/60 p-2 sm:grid-cols-5"
      >
        {TABS.map((item, index) => {
          const Icon = item.icon;
          const current = item.value === tab;
          return (
            <a
              key={item.value}
              id={`admin-tab-${item.value}`}
              role="tab"
              tabIndex={current ? 0 : -1}
              aria-selected={current}
              aria-controls={current ? `admin-panel-${item.value}` : undefined}
              href={`/admin/community?tab=${item.value}`}
              onKeyDown={(event) => moveTabFocus(event, index)}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-center text-sm font-bold outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${
                current
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>
      <p className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
        현재 화면: {activeTab.label}
      </p>
    </section>
  );
}
