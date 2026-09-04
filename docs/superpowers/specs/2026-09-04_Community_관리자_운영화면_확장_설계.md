# Community 관리자 운영화면 확장 설계

- 작성일: 2026-09-04
- 상태: 사용자 설계 승인
- 대상: `feature/community-mvp` 후속 관리자 운영 기능
- 선행 문서: [지투라이브 익명 커뮤니티 설계](./2026-09-03-익명-커뮤니티-설계.md)

## 1. 배경

현재 관리자 화면은 등록된 운영자가 email Magic Link로 로그인해 처리되지 않은 신고를 검토하고 숨김·복구·삭제·작성 제한을 실행하는 MVP다. 신고를 처리하면 해당 항목이 대기 목록에서 사라지지만 숨김 콘텐츠, 삭제 콘텐츠, 제재 사용자와 과거 운영 조치를 한 화면에서 다시 확인할 수 없다.

공개 커뮤니티를 운영하려면 신고 처리만이 아니라 오조치 복구, 삭제 주체 구분, 보존기한 확인과 감사 이력 조회가 필요하다. 따라서 관리자 화면을 단일 신고 queue에서 Community 운영 console로 확장한다.

## 2. 목표와 제외 범위

### 목표

- 공개 navigation에 관리자 항목을 추가하지 않고 `/admin` 직접 접속 동선을 제공한다.
- 하나의 관리자 session에서 신고 대기, 숨김, 삭제 대기, 제재 사용자와 운영 로그를 조회한다.
- 관리자 삭제와 작성자 직접 삭제를 구분한다.
- 숨김과 삭제 대기 콘텐츠를 정책에 따라 복구한다.
- 삭제 콘텐츠, 처리된 신고, 관리 조치와 종료된 제재를 1년 동안 제한 보관한 뒤 자동 파기한다.
- 일반 사용자에게 내부 UUID, 신고자, 보안 식별값과 관리 사유를 노출하지 않는다.

### 제외

- 공개 화면의 관리자 진입 버튼
- 다중 역할·조직·권한 등급
- 실시간 websocket 운영 현황
- 사용자 이메일이나 전화번호를 이용한 작성자 확인
- Supabase Studio를 일상 운영 UI로 사용하는 방식

## 3. 검토한 접근법

### 선택: 통합 관리자 page와 URL query tab

`/admin`은 `/admin/community`로 이동하고, 관리자 화면 안에서 `tab` query로 기능을 구분한다. 로그인, 오류 처리, 요약 수치와 navigation을 공통 shell에서 재사용하면서 특정 목록을 bookmark할 수 있다.

- `/admin/community?tab=reports`
- `/admin/community?tab=hidden`
- `/admin/community?tab=trash`
- `/admin/community?tab=sanctions`
- `/admin/community?tab=audit`

### 검토 후 제외

1. 기능별 독립 route는 규모가 커질 때 유리하지만 현재 단계에서 인증·loading·오류 UI가 중복된다.
2. Supabase Studio만 사용하면 구현량은 적지만 운영 실수 위험이 크고 서비스 규칙, 확인 절차와 audit log를 일관되게 강제하기 어렵다.

## 4. 접근과 인증

- 일반 사용자가 보는 header에는 관리자 menu를 노출하지 않는다.
- 운영자는 `/admin`을 직접 입력하거나 browser bookmark로 접근한다.
- 비로그인 상태에서는 Turnstile을 통과한 email Magic Link 요청 화면만 표시한다.
- server는 매 관리자 API 요청마다 Supabase JWT와 `community_admins` 등록 여부를 다시 확인한다.
- URL을 아는 사실은 권한으로 취급하지 않는다.
- 관리자 session과 인증정보는 오류 응답, application log와 audit log에 기록하지 않는다.

## 5. 관리자 정보 구조

### 요약

상단에 처리 대기 신고, 숨김 콘텐츠, 삭제 대기 콘텐츠와 활성 작성 제한 수를 표시한다. 요약 수치는 같은 권한 경계의 관리자 API에서 가져오고 공개 API와 cache를 공유하지 않는다.

### 신고 대기

- 미처리 신고를 최신순으로 조회한다.
- 게시글·댓글 유형과 신고 사유를 표시한다.
- 숨김, 삭제 대기와 작성 제한을 수행한다.
- 신고자 식별정보는 표시하지 않는다.

### 숨김

- `hidden` 게시글과 댓글을 최신 조치순으로 조회한다.
- 자동 신고 숨김과 관리자 수동 숨김을 구분한다.
- 숨김 사유, 조치 시각과 가공된 운영용 사용자 식별자를 표시한다.
- 관리 사유를 입력한 뒤 공개 상태로 복구할 수 있다.

### 삭제 대기

- `deleted` 게시글과 댓글을 삭제 최신순으로 조회한다.
- `author`와 `admin` 삭제를 badge와 filter로 구분한다.
- 삭제 시각, 영구 파기 예정일과 남은 일수를 표시한다.
- 관리자 삭제는 관리 사유 확인 후 복구한다.
- 작성자 직접 삭제는 경고, 관리 사유와 이중 확인 후 복구한다.

### 제재 사용자

- 현재 활성화된 작성 제한과 종료된 제한을 구분한다.
- 제한 사유, 시작·종료 시각과 가공된 운영용 사용자 식별자를 표시한다.
- 기간은 1일·7일·30일 또는 직접 지정한다.
- 해제도 별도 관리 조치로 기록한다.

### 운영 로그

- 숨김, 복구, 삭제 대기, 작성 제한과 제한 해제를 시간순으로 조회한다.
- 조치 종류, 대상 유형, 관리 사유와 시각을 표시한다.
- 관리자 email, access token, 원본 사용자 UUID와 원본 IP는 표시하지 않는다.
- 제목·내용 검색, 기간, 대상 유형, 삭제 주체와 조치 종류 filter를 제공한다.

모든 목록은 opaque cursor pagination을 사용한다. Desktop에서는 목록과 상세 검토 영역을 함께 배치하고 mobile에서는 목록 선택 후 상세 영역을 이어서 표시한다.

## 6. 데이터 모델 변경

게시글과 댓글에 다음 정보를 추가한다.

| 필드              | 의미                                        |
| ----------------- | ------------------------------------------- |
| `deletion_source` | `author`, `admin` 또는 삭제되지 않은 `null` |
| `deleted_at`      | 삭제 대기 시작 시각                         |
| `purge_at`        | 기본적으로 `deleted_at + 1 year`            |

관리자 삭제 사유와 처리자는 `community_moderation_actions`에 기록한다. 작성자 직접 삭제는 `deletion_source = author`로 구분하고 작성자 UUID를 공개 응답에 추가하지 않는다. 복구 시 `deletion_source`, `deleted_at`과 `purge_at`을 `null`로 되돌리고 복구 audit action을 추가한다.

기존 `visible`, `hidden`, `deleted` 상태값은 유지한다. 새 상태 enum을 늘리는 대신 삭제 관련 metadata로 삭제 주체와 보존기한을 표현해 기존 공개 조회 조건을 유지한다.

## 7. 상태 전이와 복구

```text
visible ──숨김──> hidden ──복구──> visible
visible ──삭제──> deleted ──복구──> visible
hidden  ──삭제──> deleted ──복구──> visible
deleted ──1년 경과──> 영구 파기
```

- 숨김 복구와 삭제 복구는 공개 상태로 되돌린다.
- 게시글 복구 시 게시글 삭제 때문에 함께 보이지 않던 댓글은 다시 표시한다.
- 댓글 자체가 별도로 `hidden` 또는 `deleted` 상태라면 게시글 복구가 그 상태를 바꾸지 않는다.
- 영구 파기되었거나 존재하지 않는 대상은 복구할 수 없다.
- 활성 legal hold가 연결된 대상은 `purge_at`이 지나도 파기하지 않는다.
- legal hold가 해제된 뒤 보존기한이 이미 지났다면 다음 retention 실행에서 파기한다.

## 8. 보존 정책

이번 설계에서 1년은 법률이 일률적으로 정한 기간이 아니라 오조치 복구와 분쟁 대응을 위해 선택한 내부 운영기간이다.

| 데이터                    | 승인된 목표 보존기간 |
| ------------------------- | -------------------- |
| 작성자·관리자 삭제 콘텐츠 | 삭제 후 1년          |
| 처리 완료 신고            | 처리 완료 후 1년     |
| Community 관리 조치       | 조치 후 1년          |
| 종료된 작성 제한          | 종료 후 1년          |
| 단기 HMAC abuse key       | 생성 후 최대 24시간  |

- 삭제 즉시 공개 접근과 일반 사용자 API 조회를 차단한다.
- 관리자 API 외의 경로에서 삭제 원문에 접근할 수 없게 한다.
- 개인정보처리방침에 처리 목적, 항목, 1년 보존기간과 영구 파기 방법을 고지한다.
- 정보주체의 정식 삭제 요구가 접수되면 1년을 기계적으로 적용하지 않고 다른 법령상 보존 필요와 진행 중인 분쟁을 개별 검토한다.
- 다른 법령상 보존 또는 분쟁 대응이 필요한 대상만 분리된 legal hold로 보존한다.
- 공개 배포 전 실제 운영 목적과 최신 법령을 기준으로 국내 법률 전문가 검토를 권장한다.

현재 구현의 삭제 콘텐츠 30일, 처리 기록 90일 파기 값은 이 설계 구현과 migration이 완료되기 전까지 유지된다. 문구만 먼저 1년으로 바꾸지 않으며 code, test, 개인정보처리방침과 release gate를 같은 변경에서 전환한다.

## 9. 관리자 API 경계

관리자 API는 하나의 범용 table 조회 endpoint 대신 용도가 명확한 endpoint로 나눈다.

- 요약 수치 조회
- 상태별 콘텐츠 목록·상세 조회
- 신고 대기 목록 조회
- 제재 목록 조회
- 운영 로그 조회
- 콘텐츠 숨김·삭제 대기·복구
- 사용자 작성 제한·해제

모든 조회는 필요한 column만 선택해 공개 DTO와 분리된 관리자 DTO로 변환한다. Query의 tab, cursor, 기간, 대상 유형과 검색어는 server에서 길이와 허용값을 검증한다. 관리자 API 응답은 `Cache-Control: no-store`를 유지한다.

## 10. 오류와 동시성

- 인증 만료: 입력 중인 관리 사유를 유지하고 다시 로그인하도록 안내한다.
- 권한 없음: 관리자 등록 여부를 노출하지 않는 공통 접근 거부 응답을 사용한다.
- 오래된 목록에서 이미 처리된 대상: 충돌 상태를 표시하고 해당 목록을 새로고침한다.
- 영구 파기 대상 복구: 복구 불가 상태와 파기 시각을 표시한다.
- provider 장애: 기존 목록을 지우지 않고 재시도 가능한 오류를 표시한다.
- 중복 클릭: 조치 중 button을 잠그고 database advisory lock과 transaction으로 중복 action을 방지한다.
- 목록 경쟁: request sequence를 검사해 오래된 실패나 성공 응답이 최신 화면을 덮어쓰지 않게 한다.

## 11. UI와 접근성

- 기존 지투라이브 color token, typography, light·dark theme와 responsive 기준을 유지한다.
- 상태는 색상만으로 구분하지 않고 badge text와 icon을 함께 사용한다.
- 파괴적 조치는 명확한 동사, 영향 범위와 복구 가능 기한을 표시한다.
- 작성자 직접 삭제 복구 modal은 “작성자가 직접 삭제한 콘텐츠이며 복구하면 다시 공개된다”는 경고를 제공한다.
- Keyboard만으로 tab, filter, 상세, 사유 입력과 확인 modal을 조작할 수 있어야 한다.
- Loading skeleton, 빈 상태, 일부 실패와 전체 실패를 구분한다.

## 12. 검증 기준

### 권한과 공개 경계

- 비로그인·익명 사용자·미등록 email 사용자의 관리자 API 호출을 거부한다.
- 공개 목록·상세 API에서 `hidden`과 `deleted` 콘텐츠를 반환하지 않는다.
- 관리자 API가 신고자, 원본 UUID, abuse key와 인증정보를 응답하지 않는다.

### 상태와 복구

- 신고 처리 후 대상이 대기 목록에서 사라지고 상태별 목록에 나타난다.
- 관리자 삭제와 작성자 직접 삭제가 정확히 구분된다.
- 숨김·삭제 복구 후 콘텐츠가 공개 API에 다시 나타난다.
- 게시글 복구가 개별 삭제 댓글을 되살리지 않는다.
- 모든 조치가 하나의 transaction으로 상태, 신고 해결과 audit log를 함께 반영한다.

### 보존

- 1년 미만 삭제 콘텐츠와 관리 기록은 보존한다.
- 1년이 지난 비보존 대상만 영구 파기한다.
- 활성 legal hold 대상은 기간이 지나도 파기하지 않는다.
- 보존기간 상수, 개인정보처리방침, migration test와 release gate가 같은 값을 사용한다.

### 화면 품질

- Desktop·mobile, light·dark mode를 확인한다.
- Tab query deep link, pagination, filter와 빈 상태를 확인한다.
- 작성자 삭제 복구의 경고와 이중 확인을 keyboard와 screen reader 기준으로 검사한다.
- 단위·component·API·Supabase pgTAP test, lint와 production build를 통과한다.

## 13. 문서 동기화와 출시 조건

구현 변경과 같은 commit 범위에서 다음 문서를 갱신한다.

- `README.md`: 실제 제공되는 관리자 기능과 운영 command가 달라질 때
- `CHANGELOG.md`: 관리자 기능, 보존기간과 보안 경계 변경
- `docs/product/프로젝트_소개.md`: 현재 제공 기능과 공개 정책
- `docs/product/프로젝트_개발_히스토리.md`: 1년 보존 선택 이유, 대안과 검증 결과
- `docs/reference/참고자료와_선정이유.md`: 법령·Supabase 공식 문서와 적용 범위
- 개인정보처리방침·이용약관·운영정책 source
- Community release gate와 backup·복구 문서

1년 보존 migration, 정책 문구, 자동 파기, 관리자 복구와 통합 test가 모두 일치하기 전에는 변경된 정책으로 공개 배포하지 않는다.

## 14. 참고 자료

- [개인정보 보호법 제21조 개인정보의 파기](https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900078981)
- [개인정보 보호법 시행령 제16조 개인정보의 파기방법](https://www.law.go.kr/lsInfoP.do?lsiSeq=186715)
- [개인정보보호위원회 개인정보 처리방침 작성지침](https://www.pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS217&mCode=D010030000.Updated)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Auth email login](https://supabase.com/docs/guides/auth/auth-email-passwordless)
