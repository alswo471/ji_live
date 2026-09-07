import Link from 'next/link';
import { ArrowUpRight, MessageCircle } from 'lucide-react';
import { COMMUNITY_LEGAL_LINKS } from '@/lib/legal/community-policy';
import { FEEDBACK_CONTACT_URL } from '@/lib/site/contact';
import { DataSourcesDialog } from './data-sources-dialog';

export function SiteFooter() {
  const contactUrl = FEEDBACK_CONTACT_URL;
  return (
    <footer className="border-t border-border px-4 py-8 text-xs leading-5 text-muted-foreground sm:px-6 lg:px-8">
      <div className="mb-6 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-base font-bold text-foreground">지투라이브</p>
          <p className="mt-1">시장 정보와 이야기가 모이는 공간</p>
        </div>
        <a
          href={contactUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageCircle aria-hidden="true" className="size-4" />
          피드백·광고 문의
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </a>
      </div>
      <nav aria-label="정책 및 문의" className="flex flex-wrap gap-x-5 gap-y-3">
        <DataSourcesDialog />
        {COMMUNITY_LEGAL_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex min-h-11 items-center font-semibold hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {link.label}
          </Link>
        ))}
        <Link
          href="/about"
          className="inline-flex min-h-11 items-center font-semibold hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          소개
        </Link>
      </nav>
      <p className="mt-5 max-w-4xl">
        지투라이브의 주식 참고 추정가, 암호화폐 가격과 사용자 게시물은 투자
        권유나 투자 판단의 근거가 아닙니다. 정보는 지연·오류·중단될 수 있으므로
        거래 전 공식 거래소와 금융기관 정보를 확인하세요. 투자 결정과 결과의
        책임은 이용자에게 있습니다.
      </p>
      <p className="mt-2">© 2026 지투라이브 · 지민재 개인 학습 프로젝트</p>
    </footer>
  );
}
