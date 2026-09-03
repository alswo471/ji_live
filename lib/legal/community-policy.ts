export const COMMUNITY_RETENTION_POLICY = {
  abuseKeyHours: 24,
  deletedContentDays: 30,
  closedModerationDays: 90,
  inactiveAnonymousUserDays: 90,
} as const;

export const COMMUNITY_LEGAL_LINKS = [
  { href: '/legal/privacy', label: '개인정보처리방침' },
  { href: '/legal/terms', label: '서비스 이용약관' },
  { href: '/legal/community-guidelines', label: '커뮤니티 운영정책' },
  { href: '/legal/rights', label: '권리침해·문의' },
] as const;

export type CommunityPolicySection = {
  id: string;
  title: string;
  paragraphs: readonly string[];
  items?: readonly string[];
};

export const COMMUNITY_PRIVACY_SECTIONS: readonly CommunityPolicySection[] = [
  {
    id: 'purpose',
    title: '1. 처리 목적',
    paragraphs: [
      '지투라이브는 익명 커뮤니티 운영, 작성물 소유권 확인, 신고 처리, 도배·보안 위협 방지와 정보주체의 권리 요청 처리를 위해 최소한의 정보를 처리합니다.',
    ],
  },
  {
    id: 'items',
    title: '2. 처리 항목',
    paragraphs: [
      '익명 사용자 UUID, 무작위 닉네임, 게시글·댓글·신고 내용과 작성 시각, 인증·보안 접속기록, 원본 IP를 즉시 단기 변환한 daily HMAC 식별값을 처리합니다.',
      '실명, 생년월일, 주소, 전화번호, 증권계좌, 보유자산과 정확한 위치정보는 커뮤니티 이용을 위해 수집하지 않습니다. 관리자 email은 관리자 인증 목적으로만 Supabase Auth에서 처리합니다.',
    ],
  },
  {
    id: 'legal-basis',
    title: '3. 처리 근거',
    paragraphs: [
      '서비스 공개 전 실제 운영 형태와 처리 항목별로 개인정보 보호법 등 적용 법령에서 허용하는 구체적 처리 근거를 확인해 표시합니다. 별도 동의가 필요한 처리는 동의를 받은 범위에서만 수행하며, 근거가 확정되지 않으면 Community를 공개하지 않습니다.',
    ],
  },
  {
    id: 'retention',
    title: '4. 보유기간',
    paragraphs: [
      'daily HMAC 식별값과 rate event는 최대 24시간, 삭제된 게시글·댓글은 접근을 차단한 뒤 최대 30일, 종료된 신고·관리 기록은 최대 90일 보관합니다. 공개 작성물과 진행 중 신고가 없는 비활성 익명 계정은 마지막 활동 후 90일이 지나면 파기 대상이 됩니다.',
      '법령상 보존 또는 진행 중인 분쟁 대응이 필요한 자료는 해당 목적에 필요한 범위와 기간 동안 legal hold로 분리한 뒤 사유가 종료되면 파기합니다.',
    ],
  },
  {
    id: 'destruction',
    title: '5. 파기 절차와 방법',
    paragraphs: [
      '보유기간이 끝난 정보는 인증된 자동 파기 작업으로 database에서 삭제하고 결과는 개인 식별정보가 없는 처리 건수로만 기록합니다. 백업본은 별도 보존주기에 따라 복구 불가능하게 교체합니다.',
    ],
  },
  {
    id: 'rights',
    title: '6. 정보주체의 권리',
    paragraphs: [
      '이용자는 개인정보의 열람·정정·삭제·처리정지와 권리침해 조치를 요청할 수 있습니다. 익명 계정의 소유권을 확인할 수 없는 경우 추가 확인이 필요하거나 법령상 제한될 수 있습니다.',
    ],
  },
  {
    id: 'security',
    title: '7. 안전성 확보조치',
    paragraphs: [
      '공개 database write 차단, JWT·Turnstile·rate limit 검증, 관리자 권한 분리, 비밀정보의 server-only 보관, 감사 기록, 최소 권한과 정기 backup·복구 점검을 적용합니다.',
    ],
  },
  {
    id: 'processor',
    title: '8. 처리위탁',
    paragraphs: [
      'Community database와 인증은 Supabase를 사용합니다. 실제 수탁 법인, 처리 목적과 보유기간은 공개 직전 최신 계약·DPA와 프로젝트 설정으로 검증한 값만 표시합니다.',
    ],
  },
  {
    id: 'overseas-processing',
    title: '9. 국외 처리',
    paragraphs: [
      '서울 primary region을 선택하더라도 인증 email, 지원·보안 기능 등 일부 처리는 국외 수탁자에게 발생할 수 있습니다. 이전 국가·법인·항목·시기·방법·목적·보유기간과 거부 시 효과를 확인하지 못하면 Community 공개를 차단합니다.',
    ],
  },
  {
    id: 'contact',
    title: '10. 문의와 권리 행사',
    paragraphs: [
      '권리 행사와 개인정보 문의는 권리침해·문의 페이지의 HTTPS 연락처로 접수합니다. 실제 연락처가 설정되지 않은 환경에서는 Community를 공개하지 않습니다.',
    ],
  },
] as const;

export const COMMUNITY_TERMS_SECTIONS: readonly CommunityPolicySection[] = [
  {
    id: 'service',
    title: '서비스 성격',
    paragraphs: [
      '지투라이브는 개인 학습 목적으로 개발된 시장 정보·의견 공유 서비스입니다. 주문 중개, 투자자문, 수익 보장 또는 금융상품 판매를 제공하지 않습니다.',
    ],
  },
  {
    id: 'information',
    title: '시장 정보 이용',
    paragraphs: [
      '표시 정보는 지연·오류·중단될 수 있고 일부 주식 값은 실제 거래소 체결가가 아닌 해외 파생상품 기반 참고 추정가입니다. 투자 판단 전 공식 거래소와 금융기관 정보를 확인해야 합니다.',
      '면책 문구는 무허가 데이터 재배포, 저작권 침해, 불법 투자자문 또는 운영자의 법적 의무를 정당화하지 않습니다.',
    ],
  },
  {
    id: 'user-content',
    title: '사용자 콘텐츠',
    paragraphs: [
      '작성자는 게시할 권리가 있는 내용만 올려야 하며 타인의 개인정보·저작물·명예와 관련 법령을 침해해서는 안 됩니다. 정책 위반 콘텐츠는 숨김·삭제되거나 작성이 제한될 수 있습니다.',
    ],
  },
  {
    id: 'availability',
    title: '서비스 변경과 중단',
    paragraphs: [
      '보안, 유지보수, 공급자 장애 또는 법적 요구에 따라 서비스 일부를 변경·중단할 수 있으며 중요한 변경은 합리적인 방법으로 알립니다.',
    ],
  },
] as const;

export const COMMUNITY_GUIDELINE_SECTIONS: readonly CommunityPolicySection[] = [
  {
    id: 'allowed',
    title: '허용되는 활동',
    paragraphs: [
      '시장과 종목에 관한 개인 의견, 출처 링크가 있는 정보 공유, 사실과 의견을 구분한 토론을 환영합니다.',
    ],
  },
  {
    id: 'prohibited',
    title: '금지되는 활동',
    paragraphs: ['아래 콘텐츠는 게시할 수 없으며 신고·관리 대상이 됩니다.'],
    items: [
      '불법정보, 음란물, 도박·범죄 유도',
      '실명·연락처·계좌 등 타인의 개인정보 노출',
      '명예훼손, 모욕, 협박, 차별·혐오 표현',
      '기사·유료 리포트·이미지 등 저작물의 무단 복제',
      '수익 보장, 유료 리딩방, 리퍼럴과 불법 투자자문 광고',
      '허위사실, 시세조종·매수 선동 목적의 반복 게시',
      '피싱·악성코드·단축 URL·도배와 무관한 광고',
    ],
  },
  {
    id: 'moderation',
    title: '신고와 관리',
    paragraphs: [
      '일반 신고는 서로 다른 유효 사용자와 daily abuse key가 각각 10개 누적되면 임시 숨김합니다. 개인정보·불법 콘텐츠는 1건부터 임시 숨김하고 운영자가 삭제 또는 복구 사유를 감사 기록에 남깁니다.',
    ],
  },
] as const;

export function getRightsContactUrl(
  env: Record<string, string | undefined> = process.env,
) {
  const value = env.NEXT_PUBLIC_RIGHTS_CONTACT_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getVerifiedProcessingDisclosure(
  env: Record<string, string | undefined> = process.env,
) {
  const fields = {
    processor: env.COMMUNITY_PROCESSOR_LEGAL_NAME,
    country: env.COMMUNITY_PROCESSOR_COUNTRY,
    purpose: env.COMMUNITY_PROCESSING_PURPOSE,
    transferMethod: env.COMMUNITY_OVERSEAS_TRANSFER_METHOD,
    retention: env.COMMUNITY_PROCESSING_RETENTION,
  };
  return Object.values(fields).every((value) => value?.trim()) ? fields : null;
}
