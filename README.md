# 지투라이브

한국·미국 주식의 해외 파생상품 기반 추정가, 암호화폐와 핵심 시장 지표를 한 화면에서 확인하는 공개용 24시간 시장 참고 대시보드입니다.

> 지민재의 개인 학습 프로젝트입니다. 바이브코딩을 활용해 기획, UI/UX, 외부 API 연동, 테스트, GitFlow, CI/CD와 배포까지 제품 개발의 전체 과정을 직접 경험하고 기록합니다.

프로젝트가 해결하려는 문제와 제품 원칙은 [프로젝트 소개](./docs/product/프로젝트_소개.md)에 기록합니다. 전체 문서는 [문서 안내](./docs/README.md)에서 확인할 수 있습니다.

## 주요 기능

- 한국 주식 7종목과 미국 주식 4종목의 해외 파생상품 기반 24시간 추정가 조회
- 원화 기준 주요 암호화폐 5종목과 PAXG 실제 거래상품 가격 조회
- 5초 주기의 현재가 자동 갱신과 공급자별 cache·장애 격리
- 가격 성격, 24시간 전 대비, 공급자와 기준 시각 표시
- KRX·NXT 시간대에 맞춘 프리·정규·애프터·휴장 세션 표시
- 한글명·영문명과 라이트·다크 화면 전환
- 한국 주식 원화 추정가를 포함한 1분·15분·1시간·4시간·일봉·주봉·월봉 OHLC·거래량 상세 차트
- 종목명 바로 아래 현재가·등락률 요약, 차트 내부 OHLC·고가·저가 표시
- 분봉은 날짜 경계에만 날짜를 표시하고 같은 날에는 시간만 표시하는 주기별 시간축
- API 실패 시 임시 숫자 대신 데이터 미제공 또는 갱신 지연 상태 표시
- GitHub Actions 품질 검사 결과 Slack 알림
- 데스크톱과 모바일을 고려한 반응형 화면
- 게시글·댓글·신고를 server API로만 처리하는 익명 Community 기반
- 마켓·커뮤니티 공통 navigation과 반응형 익명 feed·작성·댓글 페이지네이션·게시글/댓글 신고 UI
- `/admin` 직접 접근, 운영자 email Magic Link와 등록된 admin membership으로 보호되는 신고 대기·숨김·삭제 대기·제재·운영 로그 console

## 기술 스택

| 구분              | 기술                                                             |
| ----------------- | ---------------------------------------------------------------- |
| Frontend          | React 19, TypeScript, Tailwind CSS 4                             |
| Framework / Build | Vinext, Vite 8                                                   |
| UI / Chart        | shadcn/ui, Base UI, Lucide React, TradingView Lightweight Charts |
| Data              | Hyperliquid Public API, Binance Public API, Bithumb Public API   |
| Community backend | Supabase Postgres/Auth, Row Level Security, pg_cron              |
| Abuse protection  | Cloudflare Turnstile, trusted proxy, daily HMAC rate key         |
| Package manager   | pnpm                                                             |
| Code quality      | Oxlint, Oxfmt                                                    |
| CI/CD             | GitHub Actions, Slack Incoming Webhook                           |
| Version control   | Git, GitHub, GitFlow                                             |

## 데이터 갱신 구조

브라우저는 화면이 보이는 동안 5초마다 `/api/dashboard`를 조회합니다. 서버는 Hyperliquid·Binance·Bithumb 공급자를 각각 cache하고, 같은 시점의 중복 요청을 하나로 합칩니다. 숨겨진 브라우저 탭에서는 polling을 중단하며, 공급자 하나가 실패해도 다른 자산군은 계속 제공합니다.

| 데이터                    | 갱신/캐시 주기 |
| ------------------------- | -------------- |
| 현재 시세와 24시간 추정가 | 5초            |
| 1분·15분·1시간 차트       | 60초           |
| 4시간 차트                | 30분           |
| 일봉·주봉·월봉 차트       | 6시간          |

### 데이터 출처와 표시 기준

- **Hyperliquid Public API**: 검증된 한국 주식 연동 파생상품 가격
- **Binance Public API**: 검증된 한국·미국 주식 연동 USDT 무기한선물과 PAXG/USDT 현물 가격
- **Bithumb Public API**: 원화 암호화폐 가격과 `KRW-USDT` 합성환율

한국·미국 주식 가격은 KRX 또는 미국 거래소의 실제 체결가가 아니라 해외 파생상품 기반 24시간 추정가입니다. Binance 미국 주식 무기한선물과 PAXG 현물 가격은 달러가 아닌 USDT 단위로 표시합니다. 등락률은 공급자가 제공한 `24시간 전 대비`를 사용합니다. 한국 주식은 파생상품 가격에 Bithumb `KRW-USDT` 가격을 곱해 원화로 환산하며, 이 값은 은행 고시환율이 아닌 합성환율입니다.

한국 주식에는 KST 기준으로 야간, NXT 프리, KRX 시가·정규·종가, NXT 애프터와 휴장 상태를 표시합니다. 2026년 공휴일·노동절·연말 휴장일은 확인된 정적 달력을 사용하며, 달력이 등록되지 않은 연도는 영업일이라고 추측하지 않고 휴장 상태로 처리합니다.

암호화폐와 PAXG는 표시된 거래상품의 실제 가격입니다. 공급자, 가격 성격과 마지막 기준 시각을 함께 확인해야 하며, 데이터가 없거나 오래되면 임의 가격을 만들지 않고 상태를 표시합니다.

한국 주식 상세 차트는 선택한 주기의 파생상품 candle과 같은 시점의 Bithumb `KRW-USDT` candle을 결합해 원화 추정 OHLC를 만듭니다. 미래 환율로 과거 candle을 채우지 않으며 허용 시간 안의 가장 가까운 과거 환율만 사용합니다. 차트 거래량은 실제 KRX·NXT 주식 거래량이 아니라 해외 추종상품 거래량으로 별도 표기합니다.

현재 공급자는 종목별 전체 과거 이력을 제공하지 않고 한국 주식 차트도 해외 파생상품 기반 추정값입니다. 불완전한 이력에서 계산한 선을 증권사 수준의 기술적 분석으로 오인하지 않도록 이동평균·볼린저밴드 같은 보조지표와 추세선 그리기는 제공하지 않습니다. 합법적으로 재배포 가능한 장기 실제 OHLCV를 확보한 뒤 다시 검토합니다.

## 로컬 실행

### 1. 요구사항

- Node.js 22 이상
- pnpm 11 이상
- Community database 개발 시 Docker 호환 runtime

pnpm이 없다면 Corepack으로 활성화할 수 있습니다.

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
```

### 2. 설치

```bash
pnpm install
```

필수 환경변수는 없습니다. 모든 시장 데이터는 자격증명이 필요 없는 공개 API에서 조회합니다.

Community 기능은 기본적으로 비활성화되어 있으며 실제 secret은 `.env.local`에만 저장합니다. Local database를 개발할 때는 Docker 호환 runtime을 실행한 후 아래 command를 사용합니다.

Community 공개 API와 navigation은 feature flag가 켜지기 전에는 비활성화됩니다. 활성화된 환경에서는 visible 게시글·댓글만 읽고 사용자 UUID와 내부 관리 필드를 공개 DTO에서 제외합니다. 작성·삭제·신고는 anonymous JWT, Turnstile, 신뢰된 proxy가 전달한 주소의 daily HMAC abuse key와 atomic rate limit을 검증한 server API를 통해서만 수행합니다. 삭제도 별도 Turnstile과 10회/10분 제한을 통과해야 하며 429 응답은 재시도 가능 시간, 잘못된 JSON은 안전한 400 응답을 제공합니다. 현재는 운영 검증이 완료되기 전이므로 production navigation은 계속 비활성화합니다.

관리 화면은 public navigation에 노출하지 않으며 `/admin` 직접 접근 시 `/admin/community`로 이동합니다. Supabase Auth에 미리 생성한 영구 사용자 UUID를 `community_admins`에 수동 등록해야 접근할 수 있고, Magic Link 요청은 Turnstile CAPTCHA를 통과해야 하며 새 사용자를 자동 생성하지 않습니다. 관리자는 신고 대기·숨김·삭제 대기·제재·운영 로그 다섯 tab에서 상태별 API를 사용합니다. 신고 대기에서는 근거 없는 신고를 콘텐츠 변경 없이 기각할 수 있고, 작성 제한은 1·7·30일 또는 직접 지정한 시각까지 설정합니다. 숨김 화면은 자동/관리자 조치의 출처·사유·시각을 보여 주고 운영 로그는 제목·본문·기간·대상·조치·삭제 주체를 함께 검색합니다. 관리자 응답은 신고자와 raw 사용자 UUID, abuse key, secret을 반환하지 않습니다.

작성자와 관리자 삭제는 즉시 공개 API에서 제외하고 삭제 주체를 구분해 1년 동안 복구 가능한 삭제 대기로 보관합니다. 작성자 삭제 복구에는 관리 사유, 사용자 의사와 충돌할 수 있다는 경고, 이중 확인을 요구합니다. 부모 게시글은 댓글·신고·운영 기록 각각의 보존기한과 legal hold가 모두 끝난 뒤 의존 그래프와 함께 파기하고, 자연 만료된 제재도 종료 시점부터 1년 뒤 파기합니다. 신고에 사용한 network-derived HMAC은 생성 24시간 뒤 자동 숨김 집계에서 제외하며, 정상 운영에서는 매분 실행되는 Supabase `pg_cron` 작업이 다음 실행 때 값을 `null`로 scrub합니다. Scheduler 장애 중에는 물리 scrub이 늦어질 수 있으므로 공개 전 검사가 실제 job과 최근 성공 실행을 확인합니다. 1년은 법정 고정기간이 아니라 오조치 복구와 분쟁 대응을 위해 정한 내부 운영 정책입니다. 정식 삭제 요청은 개별 검토하며 진행 중인 분쟁·법령상 보존 사유는 별도 legal hold로 자동 파기에서 제외합니다. Free 플랜에서는 기본 이메일 템플릿을 유지하고, 사용량이 늘면 Supabase Pro 전환을 검토합니다. 콘텐츠 조치·신고 기각·신고 기반 작성 제한은 신고 처리와 감사 로그를 같은 database transaction으로 반영하며 활성 제재 사용자의 새 게시글·댓글 작성을 차단합니다.

```bash
pnpm dlx supabase start
pnpm dlx supabase db reset
pnpm dlx supabase db lint
pnpm dlx supabase test db
```

Local Supabase는 개발 전용이며 외부 네트워크에 공개하지 않습니다. `.env.example`의 `COMMUNITY_TRUSTED_PROXY_MODE=local`도 개발·테스트 전용이고 production에서는 애플리케이션이 이 모드를 거부합니다.

### 3. 공개 배포의 신뢰 프록시

Oracle 원점이 `CF-Connecting-IP`만 신뢰하면 직접 원점 호출자가 헤더를 위조해 network rate key를 바꿀 수 있습니다. Production은 다음 세 경계를 모두 적용합니다.

1. 다른 자격증명과 재사용하지 않는 32자 이상의 무작위 `COMMUNITY_TRUSTED_PROXY_SECRET`을 생성해 Cloudflare와 Oracle secret 저장소에만 보관합니다. 저장소·browser·로그에는 기록하지 않습니다.
2. Cloudflare Request Header Transform Rule 또는 Worker가 모든 원점 요청의 `X-Community-Proxy-Secret`을 이 값으로 **덮어쓰도록** 설정합니다. 방문자가 보낸 같은 이름의 헤더를 통과시키는 설정은 허용하지 않습니다.
3. Oracle 원점은 Cloudflare Tunnel의 outbound-only 연결을 우선 사용해 public inbound port를 열지 않습니다. Tunnel을 사용할 수 없다면 현재 Cloudflare origin IP 범위만 허용하고 나머지 직접 인바운드를 방화벽에서 차단합니다.

Production 환경은 `COMMUNITY_TRUSTED_PROXY_MODE=cloudflare`로 설정합니다. Client-IP 기반 공개 Community 작성·삭제·신고 API는 공유 헤더가 없거나 일치하지 않으면 `untrusted_proxy`로 거부한 뒤에만 `CF-Connecting-IP`를 HMAC 처리합니다. Secret 유출 시 Cloudflare와 Oracle 값을 함께 교체하고 애플리케이션을 재시작합니다. 자세한 점검·복구 절차는 [Community 백업과 복구](./docs/operations/Community_백업과_복구.md)의 신뢰 프록시 운영 절을 따릅니다.

### 4. 개발 서버 실행

현재 PC에서만 확인할 때:

```bash
pnpm dev
```

같은 Wi-Fi의 휴대폰에서도 확인할 때:

```bash
pnpm exec vinext dev --hostname 0.0.0.0
```

터미널에 출력된 `Network` 주소로 접속합니다. macOS 방화벽과 공유기의 AP isolation 설정에 따라 외부 기기 접속이 차단될 수 있습니다.

## 품질 검사

```bash
pnpm test
pnpm lint
pnpm build
```

Local Supabase를 포함한 Community 보안 통합 검사는 database를 reset한 격리 개발 환경에서 실행합니다. 실제 local Auth·RLS·RPC와 Cloudflare 공식 test key를 사용하며 production 데이터에는 실행하지 않습니다.

```bash
pnpm dlx supabase start
pnpm dlx supabase db reset
RUN_LOCAL_SUPABASE_TESTS=true pnpm exec vitest run tests/integration/community-security.test.ts
pnpm dlx supabase test db
pnpm dlx supabase db lint
pnpm dlx supabase stop
```

Community 공개 전에는 실제 환경변수, 정확한 공개 정책값 `COMMUNITY_RETENTION_DAYS=365`, 개인정보처리방침에 표시할 처리·보유 고지, 서울 region과 등록된 관리자를 확인합니다. 자동 파기는 확인용 boolean을 신뢰하지 않고 Supabase의 `community-retention-every-minute` job이 활성 상태인지, 매분 schedule인지, 최근 3분 안에 성공했는지를 직접 조회합니다. 또한 production 신뢰 proxy mode와 32자 이상 proxy/HMAC secret, 실제 Turnstile key, Supabase URL과 project ref 일치를 검사합니다. Cloudflare 공식 always-pass test key, 개발용 `local` proxy mode 또는 서로 다른 Supabase project 조합은 공개 검사에서 거부합니다. 오류에는 현재 환경변수 값이나 secret을 출력하지 않습니다. 값이 없거나 정책과 다르면 검사가 실패하는 것이 정상입니다.

```bash
pnpm check:community-release
```

Supabase Free plan에서는 주 1회 이상 암호화된 off-site logical backup을 생성하고 정기적으로 복구를 검증합니다. 상세 절차는 [Community 백업과 복구](./docs/operations/Community_백업과_복구.md)를 따릅니다.

`main` 브랜치에 push하면 GitHub Actions가 의존성 설치, lint와 production build를 검사합니다. 검사 결과는 설정된 Slack 채널로 전송됩니다.

`develop`·`main` push와 해당 branch 대상 pull request에서는 unit·migration contract test, lint, secret-shaped value scan과 production build를 실행합니다. 실제 Supabase·Turnstile secret이 필요한 release gate는 보호된 Oracle 배포 환경에서 Community 활성화 직전에만 실행합니다.

## 배포

배포 URL: Oracle Cloud 배포 완료 전까지 미정

## 브랜치와 커밋 규칙

GitFlow를 기준으로 운영합니다.

- `main`: 배포 가능한 운영 버전
- `develop`: 다음 버전 통합 브랜치
- `feature/*`: 기능 및 문서 개발
- `release/*`: 배포 준비
- `hotfix/*`: 운영 긴급 수정

규모가 있는 기능은 현재 작업 폴더를 보호하기 위해 Git worktree에서 구현합니다. 사용 방법과 병합 흐름은 [Git Worktree 작업 가이드](./docs/workflow/Git_Worktree_작업_가이드.md)를 따릅니다.

커밋 메시지는 Conventional Commits의 prefix를 사용하고 설명은 한국어를 기본으로 합니다.

```text
feat: 관심종목 검색 기능 추가
fix: 외부 API 요청 캐시 안정화
docs: 프로젝트 실행 방법과 변경 이력 정리
chore: 배포 설정 갱신
```

## 버전 및 해결 기록

- 버전별 기능 추가, 수정과 장애 해결 요약: [CHANGELOG.md](./CHANGELOG.md)
- 현재 사용법과 기술 구성: `README.md`
- 향후 긴 장애 분석이나 기술 결정: `docs/troubleshooting/`, `docs/adr/`
- 전체 문서 목차: `docs/README.md`
- 기획 의도와 제품 원칙: `docs/product/프로젝트_소개.md`
- 기획 변화와 기술 의사결정: `docs/product/프로젝트_개발_히스토리.md`
- 공식 참고자료와 선정 이유: `docs/reference/참고자료와_선정이유.md`
- Community 백업·복구 운영 절차: `docs/operations/Community_백업과_복구.md`
- 승인된 기능·아키텍처 설계: `docs/superpowers/specs/`
- GitHub Wiki: API 연동 가이드나 운영 매뉴얼처럼 길고 자주 참고하는 문서가 늘어날 때 사용

버전은 Semantic Versioning 형식(`MAJOR.MINOR.PATCH`)을 따릅니다.

- `MAJOR`: 호환되지 않는 큰 구조 변경
- `MINOR`: 기존 기능과 호환되는 새 기능
- `PATCH`: 버그 수정과 안정화

## 로드맵

- Oracle Cloud 공개 배포
- 정식 계약을 거친 실제 KRX 가격 계층 검토
- 파생 추정가와 다음 정규장 실제 시가의 오차 기록
- 검증된 파생상품 mapping과 시장 지표 확장

## 주의사항

주식 가격은 실제 주식 가격이 아닌 해외 파생상품 기반 참고 추정가입니다. 이 프로젝트는 개인 학습 및 정보 확인용이며, 제공 데이터는 지연되거나 일시적으로 부정확할 수 있습니다. 투자 권유 또는 투자 판단의 근거로 사용할 수 없으므로 공식 거래소와 금융기관 정보를 함께 확인하세요.
