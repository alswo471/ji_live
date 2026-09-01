# OO라이브

한국·미국 주식의 주요 시세와 개인 보유종목을 한 화면에서 확인하기 위해 만드는 실시간 시장 대시보드입니다.

> 지민재의 개인 학습 프로젝트입니다. 바이브코딩을 활용해 기획, UI/UX, 외부 API 연동, 테스트, GitFlow, CI/CD와 배포까지 제품 개발의 전체 과정을 직접 경험하고 기록합니다.

프로젝트가 해결하려는 문제와 제품 원칙은 [프로젝트 기획 요약](./docs/product/PROJECT_BRIEF.md)에 기록합니다.

## 주요 기능

- 한국 대표 종목 10개와 미국 주요 종목 시세 조회
- 5초 주기의 현재가 자동 갱신
- 종목별 등락률과 거래대금 표시
- 토스증권 보유종목, 평단가, 현재가와 수익률 조회
- 관심종목 저장과 한국·미국 시장별 필터링
- API 연결 전·실패 시 실제 가격처럼 보이는 임시 데이터 대신 명확한 상태 표시
- GitHub Actions 품질 검사 결과 Slack 알림
- 데스크톱과 모바일을 고려한 반응형 화면

## 기술 스택

| 구분 | 기술 |
| --- | --- |
| Frontend | React 19, TypeScript, Tailwind CSS 4 |
| Framework / Build | Vinext, Vite 8 |
| UI | shadcn/ui, Base UI, Lucide React |
| Data | Toss Invest Open API |
| Hosting | OpenAI Sites, Cloudflare Workers |
| Package manager | pnpm |
| Code quality | Oxlint, Oxfmt |
| CI/CD | GitHub Actions, Slack Incoming Webhook |
| Version control | Git, GitHub, GitFlow |

## 데이터 갱신 구조

브라우저는 화면이 보이는 동안 5초마다 `/api/dashboard`를 조회합니다. 서버는 토스증권 API 호출 제한을 지키기 위해 데이터를 용도별로 캐시합니다.

| 데이터 | 갱신/캐시 주기 |
| --- | --- |
| 주식 시세·시장 랭킹 | 5초 |
| 보유종목 | 30초 |
| 계좌 식별 정보 | 1시간 |

같은 시점의 중복 요청은 하나로 합치고, 숨겨진 브라우저 탭에서는 폴링을 중단합니다. 일시적인 API 실패가 발생하면 가능한 경우 마지막 정상 데이터를 유지합니다.

## 로컬 실행

### 1. 요구사항

- Node.js 22 이상
- pnpm 11 이상
- 토스증권 Open API Client ID와 Client Secret
- 토스증권 개발자센터에 등록한 허용 IP

pnpm이 없다면 Corepack으로 활성화할 수 있습니다.

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
```

### 2. 설치 및 환경변수 설정

```bash
pnpm install
cp .env.example .env.local
```

`.env.local`에 본인의 키를 입력합니다.

```dotenv
TOSS_INVEST_CLIENT_ID=발급받은_CLIENT_ID
TOSS_INVEST_CLIENT_SECRET=발급받은_CLIENT_SECRET
```

`.env.local`은 Git에 포함되지 않습니다. API Key와 계좌 관련 정보는 README, 이슈, 커밋 또는 Slack에 올리지 마세요.

### 3. 개발 서버 실행

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
pnpm lint
pnpm build
```

`main` 브랜치에 push하면 GitHub Actions가 의존성 설치, lint와 production build를 검사합니다. 검사 결과는 설정된 Slack 채널로 전송됩니다.

## 브랜치와 커밋 규칙

GitFlow를 기준으로 운영합니다.

- `main`: 배포 가능한 운영 버전
- `develop`: 다음 버전 통합 브랜치
- `feature/*`: 기능 및 문서 개발
- `release/*`: 배포 준비
- `hotfix/*`: 운영 긴급 수정

커밋 메시지는 Conventional Commits의 prefix를 사용하고 설명은 한국어를 기본으로 합니다.

```text
feat: 관심종목 검색 기능 추가
fix: 토스 API 429 방지를 위한 요청 캐시 적용
docs: 프로젝트 실행 방법과 변경 이력 정리
chore: 배포 설정 갱신
```

## 버전 및 해결 기록

- 버전별 기능 추가, 수정과 장애 해결 요약: [CHANGELOG.md](./CHANGELOG.md)
- 현재 사용법과 기술 구성: `README.md`
- 향후 긴 장애 분석이나 기술 결정: `docs/troubleshooting/`, `docs/adr/`
- 기획 의도와 제품 원칙: `docs/product/PROJECT_BRIEF.md`
- 승인된 기능·아키텍처 설계: `docs/superpowers/specs/`
- GitHub Wiki: API 연동 가이드나 운영 매뉴얼처럼 길고 자주 참고하는 문서가 늘어날 때 사용

버전은 Semantic Versioning 형식(`MAJOR.MINOR.PATCH`)을 따릅니다.

- `MAJOR`: 호환되지 않는 큰 구조 변경
- `MINOR`: 기존 기능과 호환되는 새 기능
- `PATCH`: 버그 수정과 안정화

## 배포 환경 참고

[배포 화면](https://oo-live.alswo472.chatgpt.site)은 OpenAI Sites에서 제공합니다. 토스증권 API는 허용 IP 정책을 사용하므로 고정 출구 IP가 없는 서버리스 환경에서는 인증이 제한될 수 있습니다. 현재 토스 실데이터 검증은 허용 IP가 등록된 로컬 환경을 기준으로 합니다.

## 로드맵

- KOSPI, NASDAQ와 환율 지표 연동
- 비트코인, 금, 달러와 엔화 데이터 추가
- 주말 참고 추정가를 실제 시세와 구분해 제공
- 관심종목 편집과 검색 경험 개선
- 고정 출구 IP를 지원하는 안전한 API 중계 서버 검토

## 주의사항

이 프로젝트는 개인 학습 및 정보 확인용입니다. 제공되는 데이터는 지연되거나 일시적으로 부정확할 수 있으며 투자 권유 또는 투자 판단의 근거로 사용할 수 없습니다.
