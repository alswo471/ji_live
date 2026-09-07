# Community 백업과 복구

Supabase Free plan은 자동 database backup에 의존하지 않고 주 1회 이상 logical dump를 만들어 암호화된 외부 저장소에 보관한다. 백업에는 익명 사용자 식별자와 삭제 대기 콘텐츠가 포함될 수 있으므로 공개 저장소, workspace와 일반 공유 폴더에 두지 않는다.

## 백업 전 준비

1. Supabase CLI 로그인과 production project link 상태를 확인한다.
2. workspace·홈·filesystem root 밖에 운영자 전용 backup directory를 만든다.
3. directory와 이후 생성 파일을 다른 사용자에게 공개하지 않는다.

## 백업 실행

```bash
pnpm backup:community -- /absolute/private/backup/directory
```

Script는 `supabase db dump --linked`를 사용하며 파일 권한을 `600`으로 만든다. 인자를 생략하거나 root, 홈 또는 workspace를 지정하면 실행을 거부한다. 실패한 불완전 파일은 제거한다.

## 암호화와 외부 보관

1. 조직에서 선택한 검증된 암호화 도구로 dump를 암호화한다. 암호화 비밀번호·개인키는 backup 파일과 다른 장소에 보관한다.
2. 암호화본을 접근 통제가 적용된 off-site 저장소에 복사한다.
3. 암호화본의 크기와 checksum을 확인한 뒤 평문은 운영체제의 안전한 삭제 절차로 제거한다.
4. 최소 월 1회 별도 임시 Supabase project 또는 격리된 local database에 복구해 migration과 주요 table count를 확인한다.

Backup 자체가 복구 가능성을 보장하지 않는다. 복구 테스트 결과, 담당자, 생성 시각과 실패 원인은 개인정보를 포함하지 않는 운영 기록으로 남긴다. 작성자·관리자 삭제 콘텐츠와 종료된 관리 기록의 1년 제한 보관은 법정 고정기간이 아니라 내부 운영 정책이다. 정식 삭제 요청은 개별 검토하고 진행 중인 분쟁·법령상 보존 사유만 별도 legal hold로 관리한다. 이 정책이 바뀌면 backup 교체·파기 주기도 함께 검토한다.

## Cloudflare와 Oracle 원점 신뢰 경계

### 위협 모델

공개 Oracle 주소로 직접 요청할 수 있는 공격자는 임의의 `CF-Connecting-IP`를 붙여 network-derived HMAC을 계속 바꿀 수 있다. 따라서 `CF-Connecting-IP`의 형식 검증만으로는 Cloudflare를 거쳤다는 사실을 증명하지 않는다. Client-IP 기반 공개 Community 작성·삭제·신고 API는 Cloudflare가 원점 전용으로 덮어쓴 공유 헤더를 먼저 검증하고, Oracle network도 직접 인바운드를 차단하는 이중 경계를 사용한다.

### Production 설정

1. 다른 자격증명과 재사용하지 않는 32자 이상의 무작위 값을 생성한다. 실제 값은 Cloudflare와 Oracle secret 저장소에만 두고 source, `.env.example`, ticket, screenshot과 application log에 남기지 않는다.
2. Cloudflare Request Header Transform Rule 또는 Worker에서 모든 application hostname 요청의 `X-Community-Proxy-Secret`을 해당 값으로 `Set static`한다. 이 동작은 방문자가 보낸 같은 이름의 헤더를 반드시 덮어써야 한다.
3. Oracle에는 같은 값을 `COMMUNITY_TRUSTED_PROXY_SECRET`으로 주입하고 `COMMUNITY_TRUSTED_PROXY_MODE=cloudflare`를 설정한다. Production process는 `local` mode를 거부하며 release gate도 `cloudflare`가 아니거나 secret이 32자 미만이면 중단한다.
4. Cloudflare Tunnel로 Oracle에서 outbound-only 연결을 만들고 public inbound port를 닫는 구성을 우선한다. Public origin을 유지해야 한다면 최신 Cloudflare origin IP 범위만 ingress allowlist에 두고 그 외 주소를 차단한다. Application 공유 비밀 검사만을 network firewall의 대체물로 사용하지 않는다.
5. 등록된 익명 test actor와 dummy가 아닌 staging 전용 Turnstile key를 사용해 Cloudflare 경유 write가 성공하고, 같은 요청을 Oracle 주소로 직접 보냈을 때 `403 untrusted_proxy`이며 rate event가 생기지 않는지 확인한다. 확인 과정에서도 공유 헤더 값과 원본 IP를 출력하지 않는다.

### 회전과 장애 복구

- 공유 비밀이 노출되거나 Cloudflare rule이 우회되었다고 의심되면 Community write feature를 비활성화하고 Cloudflare·Oracle 값을 함께 교체한 뒤 process를 재시작한다.
- Cloudflare rule을 먼저 새 값으로 바꾸면 구 값만 아는 origin이 일시적으로 모든 write를 거부한다. 짧은 fail-closed 중단을 허용하거나 배포 창에서 두 설정을 연속 변경하되, 두 값을 동시에 장기 허용하지 않는다.
- `untrusted_proxy` 증가를 code와 요청 식별자 수준으로 관찰하되 공유 비밀, `CF-Connecting-IP`, daily HMAC과 Authorization header는 log에 남기지 않는다.
- Local 개발·test만 `.env.example`의 `COMMUNITY_TRUSTED_PROXY_MODE=local`을 사용한다. 외부에서 접근 가능한 개발 서버에는 이 mode를 사용하지 않는다.

## 복구 원칙

- 운영 database에 바로 덮어쓰지 않고 격리 환경에서 dump 무결성과 schema version을 먼저 확인한다.
- 복구 중 service write를 중단하고 시작·종료 시각과 영향 범위를 기록한다.
- 관리자 secret, Auth 설정, Turnstile과 scheduler는 database dump와 별개로 다시 검증한다.
- Cloudflare header 덮어쓰기, Oracle 직접 인바운드 차단과 `COMMUNITY_TRUSTED_PROXY_MODE=cloudflare`도 database dump와 별개로 다시 검증한다.
- 복구된 삭제 대기 row의 `deletion_source`, `deleted_at`, `purge_at`과 legal hold 연결을 표본 확인하고, 백업에 남았다는 이유만으로 파기 시점이 지난 데이터를 공개 상태로 되돌리지 않는다.
- `/admin`의 삭제 대기에서 작성자·관리자 삭제가 구분되는지, 작성자 삭제 복구가 경고·관리 사유·이중 확인을 거치는지, 복구 후 공개 상세가 다시 조회되는지 격리 환경에서 확인한다.
- 실제 장애 복구 전에 최신 Supabase 공식 restore 절차와 현재 plan 제약을 다시 확인한다.

## 자동 파기 scheduler 운영

- Migration은 Supabase `pg_cron`에 `community-retention-every-minute` job을 등록하고 매분 `run_community_retention(now())`을 호출한다.
- Network-derived HMAC은 생성 24시간 뒤 집계에서 제외된다. 정상 scheduler에서는 만료 뒤 다음 1분 실행에 `null`로 scrub되지만, database 또는 scheduler 장애 중에는 물리 scrub이 늦어질 수 있다.
- `pnpm check:community-release`는 운영자가 적은 확인용 flag를 신뢰하지 않는다. Service role 전용 health RPC로 job 이름, `* * * * *` schedule, 활성 상태와 최근 3분 안의 성공 실행을 직접 검증한다.
- 복구 후에는 migration 적용 여부만 보지 말고 `cron.job`의 활성 job과 `cron.job_run_details`의 최근 `succeeded` 실행을 확인한 뒤 Community 공개를 재개한다.
- Health RPC와 `cron` metadata는 `service_role`만 조회할 수 있으며 browser·익명·일반 인증 사용자에게 공개하지 않는다.
