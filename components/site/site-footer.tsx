import Link from 'next/link';
import {
  COMMUNITY_LEGAL_LINKS,
  getRightsContactUrl,
} from '@/lib/legal/community-policy';

export function SiteFooter() {
  const contactUrl = getRightsContactUrl();
  return (
    <footer className="border-t border-border px-4 py-8 text-xs leading-5 text-muted-foreground sm:px-6 lg:px-8">
      <nav aria-label="정책 및 문의" className="flex flex-wrap gap-x-5 gap-y-3">
        {COMMUNITY_LEGAL_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="min-h-6 font-semibold hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
        <Link
          href="/about"
          className="min-h-6 font-semibold hover:text-foreground"
        >
          소개
        </Link>
        {contactUrl && (
          <a
            href={contactUrl}
            target="_blank"
            rel="noreferrer"
            className="min-h-6 font-semibold text-primary hover:underline"
          >
            피드백·광고 문의
          </a>
        )}
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
