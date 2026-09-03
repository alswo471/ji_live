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

Backup 자체가 복구 가능성을 보장하지 않는다. 복구 테스트 결과, 담당자, 생성 시각과 실패 원인은 개인정보를 포함하지 않는 운영 기록으로 남긴다. 보존기간과 legal hold 정책이 바뀌면 backup 교체·파기 주기도 함께 검토한다.

## 복구 원칙

- 운영 database에 바로 덮어쓰지 않고 격리 환경에서 dump 무결성과 schema version을 먼저 확인한다.
- 복구 중 service write를 중단하고 시작·종료 시각과 영향 범위를 기록한다.
- 관리자 secret, Auth 설정, Turnstile과 scheduler는 database dump와 별개로 다시 검증한다.
- 실제 장애 복구 전에 최신 Supabase 공식 restore 절차와 현재 plan 제약을 다시 확인한다.
