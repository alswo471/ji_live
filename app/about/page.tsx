import { LegalDocument } from '@/components/site/legal-document';
import type { CommunityPolicySection } from '@/lib/legal/community-policy';

const SECTIONS: readonly CommunityPolicySection[] = [
  {
    id: 'purpose',
    title: '왜 만들었나요?',
    paragraphs: [
      '지투라이브는 지민재가 기획, 공개 데이터 API, UI/UX, 테스트, GitFlow, 보안과 배포까지 제품 개발 전 과정을 직접 학습하고 기록하는 개인 프로젝트입니다.',
    ],
  },
  {
    id: 'principle',
    title: '어떤 원칙으로 만드나요?',
    paragraphs: [
      '실제 거래상품과 해외 파생상품 기반 참고 추정가를 구분하고, 확인하지 못한 데이터를 임의로 만들지 않습니다. 공개 서비스에 필요한 데이터 권리, 개인정보 최소화와 운영 안전장치를 기능과 함께 검증합니다.',
    ],
  },
];

export default function AboutPage() {
  return (
    <LegalDocument
      eyebrow="ABOUT G2 LIVE"
      title="지투라이브 소개"
      description="시장의 흐름을 빠르게 읽되 데이터의 성격과 한계를 숨기지 않는 공개형 멀티자산 대시보드를 지향합니다."
      sections={SECTIONS}
    />
  );
}
