import { LegalDocument } from '@/components/site/legal-document';
import { COMMUNITY_GUIDELINE_SECTIONS } from '@/lib/legal/community-policy';

export default function CommunityGuidelinesPage() {
  return (
    <LegalDocument
      eyebrow="COMMUNITY POLICY"
      title="커뮤니티 운영정책"
      description="익명이어도 법과 타인의 권리를 지켜야 합니다. 판단 기준과 관리 조치는 가능한 한 일관되게 기록합니다."
      sections={COMMUNITY_GUIDELINE_SECTIONS}
    />
  );
}
