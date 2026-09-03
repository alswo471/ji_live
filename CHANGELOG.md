# 변경 이력

지투라이브의 사용자에게 영향을 주는 주요 변경 사항과 장애 해결 내역을 기록합니다.

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)의 분류 방식을 참고하고, 버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [Unreleased]

### 추가

- 익명 커뮤니티의 게시글·댓글·신고·관리 table과 API-only write를 위한 RLS 보안 정책 추가
- 사용자와 daily abuse key를 함께 집계하는 atomic rate limit 및 10명 신고·긴급 신고 임시 숨김 RPC 추가
- anonymous JWT 검증, Turnstile server 검증과 원본 IP를 저장하지 않는 daily HMAC abuse key 추가
- HTML·위험 링크·단축 URL·중복 링크·길이·UUID를 제한하는 게시글·댓글·신고 validation 추가
- 사용자 UUID를 노출하지 않는 안정적인 익명 닉네임 생성 규칙 추가
- visible 게시글 목록·상세·댓글을 opaque cursor로 조회하는 Community API 추가
- 공개 DTO에서 작성자 UUID·상태·신고·관리 필드를 제거하고 선택적 소유권 여부만 제공
- anonymous JWT·Turnstile·daily HMAC을 검증한 게시글·댓글·소유자 삭제·신고 API 추가
- 게시글 3회/10분, 댓글 10회/10분, 신고 10회/1시간을 actor와 abuse key로 동시 집계하는 제한 추가
- idempotency key로 재시도 중복 작성을 방지하고 첫 write에서 안정적인 익명 nickname 프로필 생성

### 문서

- Mac에서 Windows로 작업 PC를 변경할 때 필요한 WSL2·GitHub SSH·Docker·Codex skill 복원 절차와 커뮤니티 구현 재개 지점 추가
- Community MVP의 anonymous Auth, RLS, local migration, Seoul region과 Free plan backup 관련 공식 근거 추가
- Cloudflare Turnstile token의 server-side 검증, 5분·1회 사용 제한과 fail-closed 처리 근거 추가

## [0.4.0] - 2026-09-02

### 추가

- Hyperliquid·Binance 파생상품 기반 한국·미국 주식 24시간 추정가 추가
- Bithumb KRW-USDT 기반 합성환율과 가격 근거 표시 추가
- 공개용 멀티자산 실시간 대시보드의 기획 의도와 1차 개편 설계 문서화
- 실제 시세와 참고 추정가를 구분하는 데이터·UI 원칙 정의
- 기능 브랜치를 격리해 구현하고 GitFlow로 병합하는 worktree 작업 가이드 추가
- 5초 자동 갱신 hook과 실제·지연·추정·연결 중 시세 상태 badge 추가
- 상승은 빨강, 하락은 파랑으로 표시하는 한국 시장 기준 등락 UI 추가
- 공개용 다크 마켓 콕핏과 한국·미국·암호화폐 자산 탭 추가
- 지투라이브 브랜드, 종목명·테마 전환과 종목 상세 차트 설계 보완
- 운영체제 설정을 따르고 선택을 유지하는 라이트·다크 테마 전환 추가
- 국내·미국 주식과 암호화폐의 한글명·영문명 전환 추가
- Binance·Bithumb 캔들을 공통 OHLCV 형식으로 제공하는 종목별 차트 API 추가
- 차트를 지원하는 주식·암호화폐 종목에 1일·1주·1개월 가격·거래량 상세 차트 추가
- 상세 차트에 1분·15분·1시간·4시간·일봉·주봉·월봉 7개 주기와 주기별 기본 표시 범위 추가
- 차트 주기와 시장 지표 보완 설계·구현 계획 문서 추가
- 한국 주식의 야간·NXT 프리·KRX 정규·NXT 애프터·휴장 세션 표시 추가
- Hyperliquid·Binance 파생 candle과 시점별 Bithumb KRW-USDT candle을 결합한 한국 주식 원화 추정 차트 추가
- 한국 주식 상세에 추정 OHLC와 추종상품 거래량 근거 표시 추가
- 기능·데이터 공급자·알고리즘 변경에 사용한 공식 참고자료와 선정 이유 기록 추가
- 상세 화면에 종목명·현재가·등락률을 연속 배치한 시세 요약 UI 추가
- 차트 내부 OHLC·고가·저가와 거래량 표시 추가
- 분봉의 날짜 경계에는 날짜, 같은 거래일 안에는 시간만 표시하는 하단 시간축 추가

### 변경

- 주식 가격을 실제 거래소 시세가 아닌 24시간 파생 추정가로 명확히 구분
- 공개 데이터 공급 구조를 Toss에서 Hyperliquid·Binance·Bithumb로 전환
- PAXG를 실제 거래상품 시세로 표시하고 금 현물과 구분
- 프로젝트 화면과 현재 문서의 브랜드를 지투라이브로 변경
- Oracle 배포 전까지 오래된 OpenAI Sites URL과 Hosting 설명을 README에서 제거
- 긴 봉의 polling을 cache 주기와 일치시키고 4시간봉 요청에 페이지·시간 예산 적용

### 수정

- Bithumb 등락률을 전일 종가 기준으로 바로잡고 합성환율을 해외 파생상품과 구분해 표시
- Bithumb ticker의 KST wall-clock epoch를 공급자 경계에서만 정규화해 정상 암호화폐·합성환율이 미래 시각으로 차단되던 문제 수정
- Binance 미국 주식 무기한선물과 PAXG 현물의 가격·차트 단위를 USD가 아닌 USDT로 명시
- 공급자 기준 시각의 유효성·노후도와 실제 Binance `count`를 검사하고 합성 시세에는 더 오래된 필수 입력 시각과 stale 상태를 전파
- catalog의 provider symbol 소유권과 운영 sanity bound를 적용해 공급자 대체·누락·비정상 단위 값을 unavailable로 격리
- 파생 거래대금의 USD·USDT 단위를 보존하고 한국 주식은 동일 합성환율로 KRW 환산
- 429 `Retry-After`와 지수 backoff를 적용하고 정상 cache가 없는 회로 차단 중에도 공급자 재호출을 억제
- 비정상·과도한 `Retry-After`는 유한한 운영 상한에서 거절하고 cache 경계에서도 지수 backoff로 재검증
- `Retry-After` 숫자형을 RFC 정수 초로, 날짜를 IMF-fixdate로 엄격히 제한해 잘못된 값이 재시도로 오인되던 문제 수정
- 일부 공급자 지연·미제공 응답을 정상 연결과 구분하고 초기 연결 안내 문구를 중립적으로 변경
- 실제 거래상품의 전일·24시간 비교 기준과 stale 공급자 시각을 표시하고 대시보드 확인 시각과 구분
- 합성환율 상세 안내를 주식 파생 추정가와 분리하고 모바일 시세 행의 등락률 중복 표시 수정
- 공급자가 등락률만 제공하는 종목의 상세 화면에서 전일 종가가 비어 보이던 문제 수정
- 테마 전환 때 차트를 재생성하지 않고 색상만 변경해 candle과 사용자 viewport가 사라지던 문제 수정
- 거래량 마지막 값이 가격 통화 축 라벨로 표시되던 오인을 막기 위해 거래량 현재값 라벨 제거
- candle 빈 응답의 장기 cache와 주기 전환·polling 중 이전 응답이 최신 결과를 덮어쓰던 문제 수정
- 한국 주식 candle 요청을 고정 미지원 처리하던 제한을 제거하고 입력별 실패 상태로 분리
- Bithumb candle의 마지막 체결 timestamp 대신 UTC 봉 시작 시각을 사용해 파생상품 candle과 같은 bucket으로 정렬

### 제거

- 공개 배포판의 Toss Invest 자격증명·시세·차트 의존성 제거
- 공급자별 전체 과거 이력과 실제 KRX OHLCV가 확보되지 않은 상태에서 분석 의미를 오인할 수 있는 이동평균·볼린저밴드·추세선 그리기 제거

### 예정

- 엔화 환율과 추가 원자재·시장 지표 확장
- 실제 시세와 구분된 주말 참고 추정가 제공
- 합법적으로 재배포 가능한 장기 실제 OHLCV 확보 후 보조지표·선 그리기 재검토

## [0.3.3] - 2026-08-31

### 추가

- 기존 구조 분석, 최소 변경과 변경 후 검증 등 Codex 작업 원칙 8개를 루트 `AGENTS.md`에 정의

## [0.3.2] - 2026-08-31

### 추가

- 프로젝트 목적, 주요 기능, 기술 스택과 로컬 실행 방법을 README에 정리
- GitFlow 브랜치와 한국어 중심의 Conventional Commits 규칙 문서화
- Keep a Changelog와 Semantic Versioning 기반 변경 이력 문서 추가
- v0.1.0부터 v0.3.1까지의 주요 기능과 장애 해결 이력 정리

### 변경

- 애플리케이션 package version을 실제 릴리스 버전과 일치하도록 정리

## [0.3.1] - 2026-08-31

### 수정

- 토스증권 API 요청이 간헐적으로 HTTP 429를 반환하던 문제 해결
- 동시에 들어온 대시보드 요청을 하나의 API 요청으로 합치도록 개선
- 시세·랭킹 5초 서버 캐시 적용
- 숨겨진 브라우저 탭의 5초 폴링 중지
- 한 탭 안에서 수동 갱신과 자동 갱신 요청이 겹치지 않도록 방지
- HTTP 429 응답 시 `Retry-After`를 반영한 제한적 재시도 추가
- 일시적인 시장 데이터 요청 실패 시 마지막 정상 데이터 유지

### 원인 및 검증

- 기존에는 각 브라우저 탭이 5초마다 시세와 한국·미국 랭킹 API를 반복 호출해 탭 수에 비례하여 요청량이 증가했습니다.
- 10개 동시 요청을 3회, 총 30회 실행해 모두 HTTP 200 응답을 확인했습니다.
- 검증 당시 시세와 시장 지표가 유지됐으며 429 로그가 재발하지 않았습니다.

## [0.3.0] - 2026-08-31

### 추가

- 한국·미국 종목의 등락률과 거래대금 표시
- GitHub Actions 성공·실패 결과 Slack 알림

### 수정

- 토스증권 API의 소수 비율 값을 화면에서 백분율로 올바르게 변환
- 시장 등락률 계산 및 표시 오류 수정
- 배포 환경의 토스 인증 상태를 확인할 수 있도록 오류 진단 강화

## [0.2.0] - 2026-08-31

### 추가

- 토스증권 Open API 시세 연동
- 한국 대표 종목 10개와 미국 주요 종목 목록
- 5초 자동 갱신과 관심종목 저장

### 수정

- API 연결 전 임시 가격이 실제 시세처럼 표시되던 문제 제거
- 시세를 불러오지 못한 경우 `연동 중…`, `연결 재시도 중…` 상태 표시

## [0.1.0] - 2026-08-31

### 추가

- OO라이브 첫 시장 대시보드 화면
- 한국·미국 시장 탭, 종목 검색, 관심종목 UI
- 라이트·다크 모드와 반응형 레이아웃
- GitHub Actions 기반 lint 및 production build 검사

[Unreleased]: https://github.com/alswo471/ji_live/compare/main...develop
[0.4.0]: https://github.com/alswo471/ji_live/compare/b10bcb8...v0.4.0
[0.3.3]: https://github.com/alswo471/ji_live/compare/b10bcb8...main
[0.3.2]: https://github.com/alswo471/ji_live/compare/113cc05...b10bcb8
[0.3.1]: https://github.com/alswo471/ji_live/compare/a65203d...113cc05
[0.3.0]: https://github.com/alswo471/ji_live/compare/e7de41a...a65203d
[0.2.0]: https://github.com/alswo471/ji_live/compare/45a6333...e7de41a
[0.1.0]: https://github.com/alswo471/ji_live/commit/45a6333
