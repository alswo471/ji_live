import { LegalDocument } from '@/components/site/legal-document';
import {
  COMMUNITY_PRIVACY_SECTIONS,
  getVerifiedProcessingDisclosure,
} from '@/lib/legal/community-policy';

export default function PrivacyPage() {
  const disclosure = getVerifiedProcessingDisclosure();
  return (
    <LegalDocument
      eyebrow="PRIVACY"
      title="개인정보처리방침"
      description="Community 공개 전에 실제 운영 설정과 최신 법령·수탁자 문서를 다시 검증합니다. 확인되지 않은 처리 사실이 있으면 release gate가 공개를 차단합니다."
      sections={COMMUNITY_PRIVACY_SECTIONS}
    >
      <section
        aria-labelledby="verified-processing-title"
        className="rounded-2xl border bg-card p-5"
      >
        <h2 id="verified-processing-title" className="text-lg font-bold">
          검증된 처리 사실
        </h2>
        {disclosure ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">수탁 법인</dt>
            <dd>{disclosure.processor}</dd>
            <dt className="font-semibold">처리 국가</dt>
            <dd>{disclosure.country}</dd>
            <dt className="font-semibold">처리 목적</dt>
            <dd>{disclosure.purpose}</dd>
            <dt className="font-semibold">이전 방법</dt>
            <dd>{disclosure.transferMethod}</dd>
            <dt className="font-semibold">보유기간</dt>
            <dd>{disclosure.retention}</dd>
          </dl>
        ) : (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            아직 공개 전 검증 단계입니다. 실제 처리 사실이 확정되기 전에는
            Community가 활성화되지 않습니다.
          </p>
        )}
      </section>
    </LegalDocument>
  );
}
