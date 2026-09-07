import { ExternalLink } from 'lucide-react';
import { LegalDocument } from '@/components/site/legal-document';
import { buttonVariants } from '@/components/ui/button';
import {
  getRightsContactUrl,
  type CommunityPolicySection,
} from '@/lib/legal/community-policy';

const SECTIONS: readonly CommunityPolicySection[] = [
  {
    id: 'requests',
    title: '접수 가능한 요청',
    paragraphs: [
      '개인정보 열람·정정·삭제·처리정지, 명예·저작권·개인정보 침해 콘텐츠의 임시조치와 이의 제기를 접수합니다.',
      '대상 URL, 요청 이유, 본인 또는 권리자임을 확인할 수 있는 최소 자료를 보내 주세요. 주민등록번호와 계좌 비밀번호 같은 불필요한 민감정보는 보내지 마세요.',
    ],
  },
  {
    id: 'process',
    title: '처리 절차',
    paragraphs: [
      '접수 내용을 확인해 필요한 경우 콘텐츠를 임시 숨김하고 작성자 의견과 관련 자료를 검토한 뒤 삭제 또는 복구합니다. 법령상 보존이 필요한 자료는 접근을 제한한 legal hold로 분리합니다.',
    ],
  },
];

export default function RightsPage() {
  const contactUrl = getRightsContactUrl();
  return (
    <LegalDocument
      eyebrow="RIGHTS & CONTACT"
      title="권리침해·문의"
      description="권리 요청과 서비스·피드백·광고 문의를 한 곳에서 접수합니다."
      sections={SECTIONS}
    >
      <section
        className="rounded-2xl border bg-card p-5"
        aria-labelledby="contact-title"
      >
        <h2 id="contact-title" className="text-lg font-bold">
          문의 접수
        </h2>
        {contactUrl ? (
          <a
            href={contactUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ className: 'mt-4 min-h-11' })}
          >
            문의 채널 열기 <ExternalLink aria-hidden="true" />
          </a>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            실제 HTTPS 문의 채널을 확인 중이며 설정 전에는 Community를 공개하지
            않습니다.
          </p>
        )}
      </section>
    </LegalDocument>
  );
}
