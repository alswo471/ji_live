import { LegalDocument } from '@/components/site/legal-document';
import { COMMUNITY_TERMS_SECTIONS } from '@/lib/legal/community-policy';

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="TERMS"
      title="서비스 이용약관"
      description="서비스의 성격, 이용자의 책임과 운영 기준을 안내합니다. 법률상 권리와 의무를 면책 문구로 배제하지 않습니다."
      sections={COMMUNITY_TERMS_SECTIONS}
    />
  );
}
