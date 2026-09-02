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

## 기술 스택

| 구분 | 기술 |
| --- | --- |
| Frontend | React 19, TypeScript, Tailwind CSS 4 |
| Framework / Build | Vinext, Vite 8 |
| UI / Chart | shadcn/ui, Base UI, Lucide React, TradingView Lightweight Charts |
| Data | Hyperliquid Public API, Binance Public API, Bithumb Public API |
| Package manager | pnpm |
| Code quality | Oxlint, Oxfmt |
| CI/CD | GitHub Actions, Slack Incoming Webhook |
| Version control | Git, GitHub, GitFlow |

## 데이터 갱신 구조

브라우저는 화면이 보이는 동안 5초마다 `/api/dashboard`를 조회합니다. 서버는 Hyperliquid·Binance·Bithumb 공급자를 각각 cache하고, 같은 시점의 중복 요청을 하나로 합칩니다. 숨겨진 브라우저 탭에서는 polling을 중단하며, 공급자 하나가 실패해도 다른 자산군은 계속 제공합니다.

| 데이터 | 갱신/캐시 주기 |
| --- | --- |
| 현재 시세와 24시간 추정가 | 5초 |
| 1분·15분·1시간 차트 | 60초 |
| 4시간 차트 | 30분 |
| 일봉·주봉·월봉 차트 | 6시간 |

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
pnpm test
pnpm lint
pnpm build
```

`main` 브랜치에 push하면 GitHub Actions가 의존성 설치, lint와 production build를 검사합니다. 검사 결과는 설정된 Slack 채널로 전송됩니다.

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
