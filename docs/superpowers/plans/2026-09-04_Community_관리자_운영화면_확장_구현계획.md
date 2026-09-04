# Community 관리자 운영화면 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 신고 queue를 신고·숨김·삭제 대기·제재·운영 로그를 관리하고 1년 안에 삭제 콘텐츠를 복구할 수 있는 Community 운영 console로 확장한다.

**Architecture:** `/admin/community`의 기존 Magic Link 인증 shell은 유지하고, 관리자 전용 read service와 목적별 API가 상태별 데이터를 공급한다. 삭제 주체와 파기 예정일은 PostgreSQL migration에서 관리하며 모든 상태 변경은 service-role 전용 transaction RPC로 처리한다. 공개 API는 계속 `visible` 콘텐츠만 반환하고 관리자 browser에도 원본 사용자 UUID를 보내지 않는다.

**Tech Stack:** TypeScript 5.9, React 19, Vinext, Supabase Auth·PostgreSQL·RLS·PL/pgSQL, Tailwind CSS 4, Vitest·Testing Library·pgTAP, Oxlint·Oxfmt

**Spec:** `docs/superpowers/specs/2026-09-04_Community_관리자_운영화면_확장_설계.md`

## Global Constraints

- 일반 사용자가 보는 navigation에는 관리자 진입점을 추가하지 않는다.
- `/admin` 직접 접근과 `/admin/community` 내부 tab만 제공한다.
- 비로그인·익명 사용자·`community_admins` 미등록 사용자의 관리자 API를 거부한다.
- 작성자와 관리자 삭제 콘텐츠는 모두 삭제 후 1년간 제한 보관하고 공개 API에서 즉시 제외한다.
- 작성자 직접 삭제도 관리자가 복구할 수 있지만 경고, 관리 사유와 이중 확인을 요구한다.
- 관리자 API는 원본 사용자 UUID, 신고자, abuse key, email과 인증정보를 browser에 반환하지 않는다.
- 단기 HMAC abuse key는 24시간, 비활성 익명 사용자는 기존 90일 정책을 유지한다.
- 1년 보존은 법정 고정기간으로 표현하지 않고 내부 운영정책으로 고지한다.
- 활성 legal hold 대상은 자동 파기하지 않는다.
- 기존 코드 스타일과 API dependency injection test pattern을 유지하고 관련 없는 refactor를 하지 않는다.
- 구현·test·개인정보처리방침·release gate가 같은 보존기간을 사용하기 전에는 새 정책을 공개 배포하지 않는다.

---

## File Structure

### Database

- Create: `supabase/migrations/202609040001_community_admin_console.sql` — 삭제 주체·파기 예정일, 관리자 통합 content view, 삭제·복구·제재 해제 transaction을 정의한다.
- Create: `supabase/migrations/202609040002_community_one_year_retention.sql` — 삭제 콘텐츠·처리 신고·관리 조치·종료 제재를 1년 기준으로 파기한다.
- Modify: `supabase/tests/community_moderation.test.sql` — 작성자·관리자 삭제 구분, 삭제 복구와 제재 해제 transaction을 검증한다.
- Modify: `supabase/tests/community_retention.test.sql` — 1년 경계와 legal hold를 검증한다.
- Create: `tests/community/admin-console-migration-contract.test.ts` — 새 migration의 권한·보존 계약을 빠르게 검사한다.

### Server domain and API

- Modify: `lib/community/write-service.ts` — 작성자 삭제를 전용 RPC로 보내 `author` source와 1년 파기일을 기록한다.
- Modify: `lib/community/moderation-service.ts` — browser에서 author UUID를 받지 않는 제한 action과 삭제 복구·제재 해제를 지원한다.
- Create: `lib/community/admin-console-service.ts` — 관리자 summary, 상태별 content, sanctions와 audit DTO·cursor·filter를 관리한다.
- Create: `lib/community/admin-actor-label.ts` — 내부 UUID를 server-only HMAC 운영 label로 변환한다.
- Modify: `tests/community/write-service.test.ts`
- Modify: `tests/community/moderation-service.test.ts`
- Create: `tests/community/admin-console-service.test.ts`
- Create: `tests/community/admin-actor-label.test.ts`
- Create: `app/api/admin/community/summary/route.ts`
- Create: `app/api/admin/community/content/route.ts`
- Create: `app/api/admin/community/sanctions/route.ts`
- Create: `app/api/admin/community/audit/route.ts`
- Modify: `app/api/admin/community/actions/route.ts`
- Modify: `tests/api/community-admin-routes.test.ts`

### Admin UI

- Create: `app/admin/page.tsx` — `/admin/community` redirect만 담당한다.
- Modify: `app/admin/community/page.tsx` — 인증 shell과 tab별 panel을 조합한다.
- Create: `hooks/use-community-admin.ts` — session, tab별 request, stale response 차단과 action 후 재조회 상태를 관리한다.
- Create: `components/community/admin-console-nav.tsx`
- Create: `components/community/admin-console-filters.tsx`
- Create: `components/community/admin-summary.tsx`
- Create: `components/community/admin-content-list.tsx`
- Create: `components/community/admin-sanction-list.tsx`
- Create: `components/community/admin-audit-list.tsx`
- Modify: `components/community/moderation-queue.tsx`
- Create: `tests/hooks/use-community-admin.test.tsx`
- Create: `tests/components/admin-console-nav.test.tsx`
- Create: `tests/components/admin-console-filters.test.tsx`
- Create: `tests/components/admin-content-list.test.tsx`
- Create: `tests/components/admin-sanction-list.test.tsx`
- Create: `tests/components/admin-audit-list.test.tsx`
- Modify: `tests/components/moderation-queue.test.tsx`
- Modify: `tests/pages/community-admin-page.test.tsx`

### Policy, operations and documentation

- Modify: `lib/legal/community-policy.ts`
- Modify: `scripts/check-community-release.mjs`
- Modify: `.env.example`
- Modify: `app/api/internal/community-retention/route.ts`
- Modify: `tests/legal/community-policy.test.ts`
- Modify: `tests/scripts/community-release-gate.test.ts`
- Modify: `tests/api/community-retention-route.test.ts`
- Modify: `tests/integration/community-security.test.ts`
- Modify: `docs/operations/Community_백업과_복구.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/product/프로젝트_소개.md`
- Modify: `docs/product/프로젝트_개발_히스토리.md`
- Modify: `docs/reference/참고자료와_선정이유.md`
- Modify: `docs/superpowers/specs/2026-09-03-익명-커뮤니티-설계.md`

---

### Task 1: 삭제 주체·파기일과 복구 가능한 database 상태 전이

**Files:**

- Create: `supabase/migrations/202609040001_community_admin_console.sql`
- Create: `tests/community/admin-console-migration-contract.test.ts`
- Modify: `supabase/tests/community_moderation.test.sql`

**Interfaces:**

- Produces: `community_posts.deletion_source`, `community_posts.purge_at`, `community_comments.deletion_source`, `community_comments.purge_at`.
- Produces: `public.delete_community_content_by_author(p_actor_id uuid, p_target_type text, p_target_id uuid)`.
- Produces: `public.revoke_community_sanction(p_admin_id uuid, p_sanction_id uuid, p_reason text)`.
- Produces: `public.community_admin_content` service-role 전용 view.
- Preserves: `public.moderate_community_content(...)` 기존 signature.

- [ ] **Step 1: 새 migration contract의 실패 test 작성**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/202609040001_community_admin_console.sql',
  'utf8',
).toLowerCase();

describe('community admin console migration', () => {
  it('records delete source and one-year purge time', () => {
    expect(sql).toContain('deletion_source');
    expect(sql).toContain('purge_at');
    expect(sql).toContain("interval '1 year'");
  });

  it('keeps author delete and admin moderation in service-role transactions', () => {
    expect(sql).toContain('delete_community_content_by_author');
    expect(sql).toContain('moderate_community_content');
    expect(sql).toContain('revoke_community_sanction');
    expect(sql).toContain('to service_role');
  });

  it('does not grant the admin content view to browser roles', () => {
    expect(sql).toContain('community_admin_content');
    expect(sql).toContain(
      'revoke all on public.community_admin_content from anon, authenticated',
    );
  });
});
```

- [ ] **Step 2: Contract test가 migration 부재로 실패하는지 확인**

Run: `pnpm test -- tests/community/admin-console-migration-contract.test.ts`

Expected: FAIL with `ENOENT` for `202609040001_community_admin_console.sql`.

- [ ] **Step 3: 삭제 metadata와 기존 row backfill 작성**

```sql
alter table public.community_posts
  add column deletion_source text,
  add column purge_at timestamptz;

alter table public.community_comments
  add column deletion_source text,
  add column purge_at timestamptz;

update public.community_posts p
set deletion_source = case when exists (
      select 1 from public.community_moderation_actions a
      where a.post_id = p.id and a.action = 'delete'
    ) then 'admin' else 'author' end,
    purge_at = p.deleted_at + interval '1 year'
where p.status = 'deleted';

update public.community_comments c
set deletion_source = case when exists (
      select 1 from public.community_moderation_actions a
      where a.comment_id = c.id and a.action = 'delete'
    ) then 'admin' else 'author' end,
    purge_at = c.deleted_at + interval '1 year'
where c.status = 'deleted';
```

두 table에 `deletion_source in ('author', 'admin')`와 `status = 'deleted'`일 때 세 metadata가 모두 존재하고 그 외 상태에서는 모두 `null`인 check constraint를 추가한다.

- [ ] **Step 4: 작성자 삭제 RPC와 통합 관리자 content view 작성**

```sql
create or replace function public.delete_community_content_by_author(
  p_actor_id uuid, p_target_type text, p_target_id uuid
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare deleted_time timestamptz := now();
begin
  if p_target_type = 'post' then
    update public.community_posts
    set status = 'deleted', deletion_source = 'author',
        deleted_at = deleted_time, purge_at = deleted_time + interval '1 year'
    where id = p_target_id and author_id = p_actor_id and status <> 'deleted';
  elsif p_target_type = 'comment' then
    update public.community_comments
    set status = 'deleted', deletion_source = 'author',
        deleted_at = deleted_time, purge_at = deleted_time + interval '1 year'
    where id = p_target_id and author_id = p_actor_id and status <> 'deleted';
  else
    raise exception using errcode = '22023', message = 'invalid community target';
  end if;
  if not found then
    raise exception using errcode = 'P0002', message = 'community content not found';
  end if;
end;
$$;
```

`community_admin_content` view는 post와 comment를 `union all`하고 `target_type`, `target_id`, `author_id`, `author_name`, `title`, `body`, `status`, `deletion_source`, `deleted_at`, `purge_at`, `created_at`만 제공한다. `anon`, `authenticated` 권한은 revoke하고 `service_role`에만 select를 grant한다.

- [ ] **Step 5: 관리자 RPC의 삭제·복구와 제재 해제 상태 전이 작성**

`moderate_community_content`에서 `delete`는 `deletion_source = 'admin'`, 같은 DB 시각의 `deleted_at`, `purge_at = deleted_at + interval '1 year'`를 설정한다. `restore`는 `hidden`과 `deleted`를 허용해 `visible`로 전환하고 세 삭제 metadata를 `null`로 지운다. `hide`와 `delete`는 영구 파기된 대상에 `P0002`를 반환한다.

```sql
alter table public.community_moderation_actions
  drop constraint community_moderation_actions_action_check,
  add constraint community_moderation_actions_action_check
  check (action in ('hide', 'restore', 'delete', 'restrict', 'unrestrict'));
```

`revoke_community_sanction`은 관리자 등록, 5~500자 사유, 아직 해제되지 않은 sanction을 확인하고 `revoked_at = now()`와 `unrestrict` audit insert를 한 transaction에서 수행한다.

- [ ] **Step 6: pgTAP에 작성자·관리자 삭제와 복구·해제 test 추가**

```sql
select lives_ok(
  $$ select public.delete_community_content_by_author(
    md5('moderation-author')::uuid, 'post',
    '60000000-0000-0000-0000-000000000001'
  ) $$,
  'author delete is atomic'
);

select is(
  (select deletion_source from public.community_posts
   where id = '60000000-0000-0000-0000-000000000001'),
  'author',
  'author deletion is distinguishable'
);
```

관리자 `delete → restore`, 작성자 `delete → restore`, 작성 제한 `restrict → unrestrict`, browser role RPC 거부와 view select 거부를 각각 assert한다.

- [ ] **Step 7: migration contract와 local Supabase test 통과 확인**

Run: `pnpm test -- tests/community/admin-console-migration-contract.test.ts tests/community/moderation-migration-contract.test.ts`

Expected: both files PASS.

Run: `pnpm exec supabase start && pnpm exec supabase db reset && pnpm exec supabase db lint && pnpm exec supabase test db`

Expected: reset succeeds, schema lint reports no errors, all pgTAP assertions PASS.

- [ ] **Step 8: Database 변경 commit**

```bash
git add supabase/migrations/202609040001_community_admin_console.sql supabase/tests/community_moderation.test.sql tests/community/admin-console-migration-contract.test.ts
git commit -m "feat(community): 삭제 복구 상태와 운영 metadata 추가"
```

---

### Task 2: 1년 retention과 정책 상수의 단일 기준화

**Files:**

- Create: `supabase/migrations/202609040002_community_one_year_retention.sql`
- Modify: `supabase/tests/community_retention.test.sql`
- Modify: `lib/legal/community-policy.ts`
- Modify: `app/api/internal/community-retention/route.ts`
- Modify: `tests/legal/community-policy.test.ts`
- Modify: `tests/api/community-retention-route.test.ts`
- Modify: `tests/community/admin-console-migration-contract.test.ts`

**Interfaces:**

- Produces: `COMMUNITY_RETENTION_POLICY.deletedContentDays = 365`.
- Produces: `COMMUNITY_RETENTION_POLICY.closedModerationDays = 365`.
- Produces: `COMMUNITY_RETENTION_POLICY.closedSanctionDays = 365`.
- Changes: `CommunityRetentionCounts`에 `sanctions: number` 추가.
- Preserves: `abuseKeyHours = 24`, `inactiveAnonymousUserDays = 90`.

- [ ] **Step 1: 1년 policy와 response count 실패 test 작성**

```ts
expect(COMMUNITY_RETENTION_POLICY.deletedContentDays).toBe(365);
expect(COMMUNITY_RETENTION_POLICY.closedModerationDays).toBe(365);
expect(COMMUNITY_RETENTION_POLICY.closedSanctionDays).toBe(365);
expect(COMMUNITY_RETENTION_POLICY.inactiveAnonymousUserDays).toBe(90);
```

Retention route test의 성공 response에 `sanctions: 2`를 추가하고 정확히 반환되는지 검사한다.

- [ ] **Step 2: 기존 30일·90일 구현 때문에 실패하는지 확인**

Run: `pnpm test -- tests/legal/community-policy.test.ts tests/api/community-retention-route.test.ts tests/community/admin-console-migration-contract.test.ts`

Expected: FAIL on 30/90 constants, missing `sanctions`, and missing one-year retention migration.

- [ ] **Step 3: 1년 retention migration 작성**

`run_community_retention`을 교체해 다음 조건을 사용한다.

```sql
where p.status = 'deleted' and p.purge_at <= p_now
where c.status = 'deleted' and c.purge_at <= p_now
where r.status <> 'open' and r.resolved_at < p_now - interval '1 year'
where a.created_at < p_now - interval '1 year'
where s.revoked_at is not null and s.revoked_at < p_now - interval '1 year'
```

활성 legal hold와 연결된 post, comment, report, moderation action은 기존처럼 제외한다. 종료 sanction은 연결된 `user` legal hold가 활성 상태면 제외한다. 반환 JSON에 `sanctions` count를 추가한다.

- [ ] **Step 4: TypeScript policy와 개인정보 문구를 1년으로 변경**

```ts
export const COMMUNITY_RETENTION_POLICY = {
  abuseKeyHours: 24,
  deletedContentDays: 365,
  closedModerationDays: 365,
  closedSanctionDays: 365,
  inactiveAnonymousUserDays: 90,
} as const;
```

Privacy retention 문단에는 작성자·관리자 삭제 콘텐츠, 처리된 신고·관리 기록과 종료된 제재를 접근 제한 후 최대 1년 보관한다는 사실과 이 기간이 분쟁 대응·오조치 복구를 위한 운영정책임을 명시한다.

- [ ] **Step 5: 364일·366일과 legal hold pgTAP 경계 작성**

```sql
select is(
  (select count(*)::integer from public.community_posts
   where id = '71000000-0000-0000-0000-000000000001'),
  0,
  'deleted content older than one year is purged'
);

select is(
  (select count(*)::integer from public.community_posts
   where id = '71000000-0000-0000-0000-000000000003'),
  1,
  'deleted content younger than one year is retained'
);
```

366일 row는 삭제되고 364일 row와 legal hold row는 남으며, 처리 완료 신고·audit·해제된 sanction도 같은 경계를 따르는지 검사한다.

- [ ] **Step 6: Retention 단위·DB test 통과 확인**

Run: `pnpm test -- tests/legal/community-policy.test.ts tests/api/community-retention-route.test.ts tests/community/admin-console-migration-contract.test.ts`

Expected: all selected tests PASS.

Run: `pnpm exec supabase db reset && pnpm exec supabase test db`

Expected: all pgTAP assertions PASS with one-year boundaries.

- [ ] **Step 7: Retention 변경 commit**

```bash
git add supabase/migrations/202609040002_community_one_year_retention.sql supabase/tests/community_retention.test.sql lib/legal/community-policy.ts app/api/internal/community-retention/route.ts tests/legal/community-policy.test.ts tests/api/community-retention-route.test.ts tests/community/admin-console-migration-contract.test.ts
git commit -m "feat(community): 삭제와 운영 기록 보존기간을 1년으로 전환"
```

---

### Task 3: 원본 UUID를 숨기는 관리자 domain service

**Files:**

- Create: `lib/community/admin-actor-label.ts`
- Create: `lib/community/admin-console-service.ts`
- Modify: `lib/community/write-service.ts`
- Modify: `lib/community/moderation-service.ts`
- Create: `tests/community/admin-actor-label.test.ts`
- Create: `tests/community/admin-console-service.test.ts`
- Modify: `tests/community/write-service.test.ts`
- Modify: `tests/community/moderation-service.test.ts`

**Interfaces:**

- Produces: `createAdminActorLabel(userId: string, secret?: string): string` → `익명 사용자 #A82F` 형식.
- Produces: `AdminTab = 'reports' | 'hidden' | 'trash' | 'sanctions' | 'audit'`.
- Produces: `getAdminSummary()`, `listAdminContent(input)`, `listAdminSanctions(input)`, `listAdminAudit(input)`.
- Changes: `ModerationAction` restriction input이 `userId` 대신 `targetType`과 `targetId`를 사용한다.
- Produces: `{ type: 'unrestrict'; sanctionId: string; reason: string }` action.

- [ ] **Step 1: 안정적인 비식별 운영 label 실패 test 작성**

```ts
it('creates a stable label without exposing the UUID', () => {
  const id = '30000000-0000-4000-8000-000000000001';
  const label = createAdminActorLabel(id, 'test-secret-at-least-32-characters');
  expect(label).toMatch(/^익명 사용자 #[A-F0-9]{4}$/);
  expect(label).not.toContain(id);
  expect(createAdminActorLabel(id, 'test-secret-at-least-32-characters')).toBe(
    label,
  );
});
```

- [ ] **Step 2: 관리자 DTO privacy·filter·cursor 실패 test 작성**

```ts
expect(page.items[0]).toMatchObject({
  targetType: 'post',
  status: 'deleted',
  deletionSource: 'author',
  actorLabel: expect.stringMatching(/^익명 사용자 #/),
  purgeAt: '2027-09-04T05:00:00.000Z',
});
expect(page.items[0]).not.toHaveProperty('authorId');
expect(page.items[0]).not.toHaveProperty('reporterId');
```

잘못된 `tab`, `targetType`, `deletionSource`, 100자를 넘는 search, 변조된 cursor가 `CommunityAdminConsoleError(400, ...)`로 거부되는 test를 함께 작성한다.

- [ ] **Step 3: 운영 label과 관리자 DTO·cursor 구현**

`createAdminActorLabel`은 server-only `COMMUNITY_HMAC_SECRET`으로 `HMAC-SHA-256("admin-label:" + userId)`를 만들고 앞 4자리 대문자 hex만 반환한다. Secret이 32자 미만이면 provider detail 없이 503 error를 발생시킨다.

```ts
export interface AdminContentItem {
  targetType: 'post' | 'comment';
  targetId: string;
  actorLabel: string;
  authorName: string;
  title: string | null;
  body: string;
  status: 'hidden' | 'deleted';
  deletionSource: 'author' | 'admin' | null;
  deletedAt: string | null;
  purgeAt: string | null;
  createdAt: string;
}
```

Cursor는 `[sortAt, targetType, targetId]`를 URL-safe base64로 encode하고 UUID·ISO timestamp·허용 type을 decode 시점에 검증한다. 목록 limit은 20, 최대 50으로 제한한다.

- [ ] **Step 4: 작성자 삭제 repository를 DB RPC로 전환**

```ts
softDeletePost(actorId: string, id: string): Promise<void>;
softDeleteComment(actorId: string, id: string): Promise<void>;
```

두 method는 `delete_community_content_by_author` RPC에 검증된 actor ID와 target만 전달한다. `deletePost`와 `deleteComment` service가 repository에 actor ID를 전달하는 test를 추가한다.

- [ ] **Step 5: Restriction action에서 browser author UUID 제거**

```ts
export type ModerationAction =
  | {
      type: 'hide' | 'restore' | 'delete';
      targetType: ReportTargetType;
      targetId: string;
      reason: string;
    }
  | {
      type: 'restrict';
      targetType: ReportTargetType;
      targetId: string;
      until: string;
      reason: string;
    }
  | { type: 'unrestrict'; sanctionId: string; reason: string };
```

Repository는 `restrict` 실행 직전에 service-role query로 target author를 찾고 기존 moderation RPC에 전달한다. Browser payload의 `userId`는 허용하지 않는다. `unrestrict`는 새 RPC를 호출한다.

- [ ] **Step 6: Domain test 통과 확인**

Run: `pnpm test -- tests/community/admin-actor-label.test.ts tests/community/admin-console-service.test.ts tests/community/write-service.test.ts tests/community/moderation-service.test.ts`

Expected: all four files PASS and no DTO assertion contains raw user UUID.

- [ ] **Step 7: Domain 변경 commit**

```bash
git add lib/community/admin-actor-label.ts lib/community/admin-console-service.ts lib/community/write-service.ts lib/community/moderation-service.ts tests/community/admin-actor-label.test.ts tests/community/admin-console-service.test.ts tests/community/write-service.test.ts tests/community/moderation-service.test.ts
git commit -m "feat(community): 관리자 조회와 비식별 운영 경계 추가"
```

---

### Task 4: 목적별 관리자 read API와 action 오류 경계

**Files:**

- Create: `app/api/admin/community/summary/route.ts`
- Create: `app/api/admin/community/content/route.ts`
- Create: `app/api/admin/community/sanctions/route.ts`
- Create: `app/api/admin/community/audit/route.ts`
- Modify: `app/api/admin/community/actions/route.ts`
- Modify: `tests/api/community-admin-routes.test.ts`

**Interfaces:**

- Produces: `GET /api/admin/community/summary` → `AdminSummary`.
- Produces: `GET /api/admin/community/content?status=hidden|deleted&targetType=all|post|comment&deletionSource=all|author|admin&query=&cursor=`.
- Produces: `GET /api/admin/community/sanctions?state=active|ended&cursor=`.
- Produces: `GET /api/admin/community/audit?action=&targetType=&query=&cursor=`.
- Preserves: `POST /api/admin/community/actions`, now including `unrestrict`.

- [ ] **Step 1: 모든 route에 공통 인증·no-store 실패 test 작성**

```ts
it('rejects anonymous content access without calling the loader', async () => {
  const listContent = vi.fn();
  const response = await handleAdminContentRequest(
    new Request('http://localhost/api/admin/community/content?status=deleted'),
    {
      enabled: () => true,
      requireAdmin: async () => {
        throw new CommunityAdminAuthError(
          401,
          'admin_auth_required',
          '관리자 권한이 필요합니다.',
        );
      },
      listContent,
    },
  );
  expect(response.status).toBe(401);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(listContent).not.toHaveBeenCalled();
});
```

Summary의 `loadSummary`, sanctions의 `listSanctions`, audit의 `listAudit`에 대해서도 별도 test를 작성해 인증 실패 시 loader가 호출되지 않는 것을 검증한다.

- [ ] **Step 2: Query 전달과 안전한 오류 mapping test 작성**

각 route가 허용된 query만 service로 전달하고 `CommunityAdminConsoleError`는 400/404/409, provider error는 내부 detail 없이 503으로 반환하는지 검사한다. Disabled 상태는 인증을 호출하지 않고 404를 반환해야 한다.

- [ ] **Step 3: 기존 route pattern으로 네 GET handler 구현**

```ts
const dependencies = {
  enabled: isCommunityEnabled,
  requireAdmin: requireCommunityAdmin,
  loadSummary: getAdminSummary,
};

export async function handleAdminSummaryRequest(
  request: Request,
  deps = dependencies,
) {
  if (!deps.enabled())
    return json({ error: '페이지를 찾을 수 없습니다.' }, 404);
  try {
    await deps.requireAdmin(request);
    return json(await deps.loadSummary(), 200);
  } catch (error) {
    return mapAdminError(error);
  }
}
```

반복되는 response mapping은 `lib/community/admin-console-service.ts`의 공개 error type을 사용하되 route별 dependency injection 형태는 유지한다.

- [ ] **Step 4: Action route에서 stale target과 invalid transition 구분**

Database `P0002`는 404, 이미 처리돼 현재 상태와 action이 충돌하면 409 `moderation_state_conflict`, 입력 오류는 400으로 mapping한다. Provider 원문 message와 관리자 등록 여부는 응답에 넣지 않는다.

- [ ] **Step 5: 관리자 API test 통과 확인**

Run: `pnpm test -- tests/api/community-admin-routes.test.ts`

Expected: all admin route authentication, query, no-store, action and safe-error cases PASS.

- [ ] **Step 6: API 변경 commit**

```bash
git add app/api/admin/community/summary/route.ts app/api/admin/community/content/route.ts app/api/admin/community/sanctions/route.ts app/api/admin/community/audit/route.ts app/api/admin/community/actions/route.ts tests/api/community-admin-routes.test.ts
git commit -m "feat(community): 관리자 상태별 조회 API 추가"
```

---

### Task 5: `/admin` 운영 console UI와 안전한 복구 interaction

**Files:**

- Create: `app/admin/page.tsx`
- Modify: `app/admin/community/page.tsx`
- Create: `hooks/use-community-admin.ts`
- Create: `components/community/admin-console-nav.tsx`
- Create: `components/community/admin-console-filters.tsx`
- Create: `components/community/admin-summary.tsx`
- Create: `components/community/admin-content-list.tsx`
- Create: `components/community/admin-sanction-list.tsx`
- Create: `components/community/admin-audit-list.tsx`
- Modify: `components/community/moderation-queue.tsx`
- Create: `tests/hooks/use-community-admin.test.tsx`
- Create: `tests/components/admin-console-nav.test.tsx`
- Create: `tests/components/admin-console-filters.test.tsx`
- Create: `tests/components/admin-content-list.test.tsx`
- Create: `tests/components/admin-sanction-list.test.tsx`
- Create: `tests/components/admin-audit-list.test.tsx`
- Modify: `tests/components/moderation-queue.test.tsx`
- Modify: `tests/pages/community-admin-page.test.tsx`

**Interfaces:**

- Produces: `useCommunityAdmin(tab: AdminTab, filters: AdminConsoleFilters)` with session, summary, items, loading, error, pagination and action methods.
- Produces: query tabs `reports`, `hidden`, `trash`, `sanctions`, `audit`.
- Produces: `AdminConsoleFilters` with `targetType`, `deletionSource`, `sanctionState`, `action`, `query`.
- Consumes: Task 4 관리자 endpoints and `ModerationAction`.

- [ ] **Step 1: `/admin` redirect와 tab parsing page test 작성**

```ts
expect(mockRedirect).toHaveBeenCalledWith('/admin/community');
expect(screen.getByRole('tab', { name: '신고 대기' })).toHaveAttribute(
  'aria-selected',
  'true',
);
expect(screen.getByRole('tab', { name: '삭제 대기' })).toHaveAttribute(
  'href',
  '/admin/community?tab=trash',
);
```

Unknown tab은 `reports`로 안전하게 fallback하고 공개 `SiteHeader`에는 관리자 link가 추가되지 않는지 검사한다.

- [ ] **Step 2: Hook의 session·stale response·action refresh 실패 test 작성**

기존 page regression test의 오래된 503이 최신 성공을 덮어쓰지 않는 시나리오를 hook test로 옮기고, tab 변경 시 이전 tab response를 무시하는 경우를 추가한다.

```ts
expect(result.current.error).toBeNull();
expect(result.current.items).toEqual(latestTrashPage.items);
expect(fetch).toHaveBeenCalledWith(
  expect.stringContaining('status=deleted'),
  expect.objectContaining({ cache: 'no-store' }),
);
```

- [ ] **Step 3: Session과 tab loading을 hook으로 분리**

```ts
export function useCommunityAdmin(tab: AdminTab, filters: AdminConsoleFilters) {
  return {
    accessToken,
    checkingSession,
    summary,
    items,
    nextCursor,
    loading,
    error,
    reload,
    loadMore,
    applyAction,
  };
}
```

같은 access token의 중복 초기 load를 막고 request sequence로 stale response를 무시한다. Action 성공 후 현재 tab과 summary를 함께 갱신하며 실패 시 기존 목록을 유지한다.

- [ ] **Step 4: Navigation과 summary component 작성**

`AdminConsoleNav`는 semantic tab list, query link, 현재 tab의 text·icon 상태를 제공한다. `AdminSummary`는 네 수치를 button이 아닌 link card로 표시해 관련 tab으로 이동하게 한다. 상태는 색상만으로 구분하지 않는다.

- [ ] **Step 5: Tab별 filter와 search 상태 작성**

`AdminConsoleFilters`는 현재 tab에 필요한 control만 표시한다. 숨김은 대상 유형과 search, 삭제 대기는 대상 유형·삭제 주체와 search, 제재는 활성·종료, 운영 로그는 action·대상 유형·기간과 search를 제공한다. Search는 최대 100자로 제한하고 URL query에 저장하며 filter 변경 시 cursor를 초기화한다.

```ts
export interface AdminConsoleFilters {
  targetType: 'all' | 'post' | 'comment';
  deletionSource: 'all' | 'author' | 'admin';
  sanctionState: 'active' | 'ended';
  action: 'all' | 'hide' | 'restore' | 'delete' | 'restrict' | 'unrestrict';
  query: string;
}
```

Test는 각 tab에서 허용된 label만 나타나는지, 101자 입력이 잘리는지, filter 변경 callback이 page cursor 초기화 신호와 함께 호출되는지 검사한다.

- [ ] **Step 6: 숨김·삭제 대기 목록과 복구 확인 test 작성**

```ts
it('requires a warning and double confirmation for author-deleted content', async () => {
  render(<AdminContentList items={[authorDeleted]} onAction={onAction} />);
  fireEvent.change(screen.getByLabelText('관리 사유'), {
    target: { value: '작성자 요청을 확인한 복구 처리' },
  });
  fireEvent.click(screen.getByRole('button', { name: '복구' }));
  expect(screen.getByText(/작성자가 직접 삭제한 콘텐츠/)).toBeInTheDocument();
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '복구 확정' }));
  await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
});
```

`admin` 삭제와 `hidden` 복구는 사유 5자 검증 후 한 번의 확인으로 실행하고, `purgeAt`으로 남은 일수를 표시한다.

- [ ] **Step 7: 제재·운영 로그 panel 작성**

제재 panel은 활성·종료 filter, 종료 시각과 해제 action을 제공한다. 운영 로그 panel은 조치·대상·사유·시각을 read-only로 표시한다. 어느 panel도 raw UUID, email, IP 또는 신고자를 render하지 않는 component test를 작성한다.

- [ ] **Step 8: 기존 신고 queue의 restriction payload 수정**

`targetAuthorId` 표시·전달을 제거하고 `restrict` action에 현재 `targetType`, `targetId`, `until`, `reason`만 전달한다. Delete button 문구는 `삭제`에서 `삭제 대기`로 바꾸고 영구 파기 예정 정책을 confirmation에 표시한다.

- [ ] **Step 9: Page를 인증 shell과 tab panel 조합으로 정리**

로그인 전 `AdminLogin`과 Turnstile은 그대로 유지한다. 로그인 후 heading, logout, summary, tab navigation과 현재 panel만 render한다. Desktop은 최대 폭 안에서 목록·상세 2열, mobile은 1열 흐름을 사용하고 기존 light·dark token만 사용한다.

- [ ] **Step 10: UI test와 접근성 상태 통과 확인**

Run: `pnpm test -- tests/hooks/use-community-admin.test.tsx tests/components/admin-console-nav.test.tsx tests/components/admin-console-filters.test.tsx tests/components/admin-content-list.test.tsx tests/components/admin-sanction-list.test.tsx tests/components/admin-audit-list.test.tsx tests/components/moderation-queue.test.tsx tests/pages/community-admin-page.test.tsx`

Expected: all selected tests PASS, tab roles and confirmation dialogs are keyboard-addressable, stale request regression remains green.

- [ ] **Step 11: Admin UI 변경 commit**

```bash
git add app/admin/page.tsx app/admin/community/page.tsx hooks/use-community-admin.ts components/community/admin-console-nav.tsx components/community/admin-console-filters.tsx components/community/admin-summary.tsx components/community/admin-content-list.tsx components/community/admin-sanction-list.tsx components/community/admin-audit-list.tsx components/community/moderation-queue.tsx tests/hooks/use-community-admin.test.tsx tests/components/admin-console-nav.test.tsx tests/components/admin-console-filters.test.tsx tests/components/admin-content-list.test.tsx tests/components/admin-sanction-list.test.tsx tests/components/admin-audit-list.test.tsx tests/components/moderation-queue.test.tsx tests/pages/community-admin-page.test.tsx
git commit -m "feat(community): 관리자 운영 콘솔과 복구 UI 추가"
```

---

### Task 6: Release gate·통합 보안 검증·운영 문서 동기화

**Files:**

- Modify: `scripts/check-community-release.mjs`
- Modify: `.env.example`
- Modify: `tests/scripts/community-release-gate.test.ts`
- Modify: `tests/integration/community-security.test.ts`
- Modify: `docs/operations/Community_백업과_복구.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/product/프로젝트_소개.md`
- Modify: `docs/product/프로젝트_개발_히스토리.md`
- Modify: `docs/reference/참고자료와_선정이유.md`
- Modify: `docs/superpowers/specs/2026-09-03-익명-커뮤니티-설계.md`

**Interfaces:**

- Produces: release gate가 `COMMUNITY_RETENTION_DAYS=365`와 공개 privacy 문구를 검사한다.
- Verifies: 익명 작성자 삭제 → 관리자 조회 → 관리자 복구 → 공개 재노출 end-to-end.
- Verifies: 관리자 삭제 → 1년 retention → legal hold 예외.

- [ ] **Step 1: Release gate의 정책 불일치 실패 test 작성**

```ts
expect(() =>
  assertCommunityReleaseConfig({
    ...VALID_ENV,
    COMMUNITY_RETENTION_DAYS: '30',
  }),
).toThrow('COMMUNITY_RETENTION_DAYS');
```

Gate는 `COMMUNITY_RETENTION_DAYS`가 정확히 `365`가 아니면 거부한다. `COMMUNITY_PROCESSING_RETENTION`은 공개 고지에 사용할 검증된 설명을 계속 요구하되 환경변수의 실제 값은 오류 message에 포함하지 않는다. `.env.example`에는 값 없이 두지 않고 공개 가능한 정책값 `COMMUNITY_RETENTION_DAYS=365`를 기록한다.

- [ ] **Step 2: Local integration에 작성자·관리자 삭제 복구 흐름 추가**

```ts
const deleteResponse = await handleDeletePostRequest(
  new Request(`http://localhost/api/community/posts/${created.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${actors[0].token}` },
  }),
  created.id,
);
expect(deleteResponse.status).toBe(204);

const hiddenPublic = await handleGetPostRequest(
  new Request(`http://localhost/api/community/posts/${created.id}`),
  created.id,
);
expect(hiddenPublic.status).toBe(404);

const trashResponse = await handleAdminContentRequest(
  new Request('http://localhost/api/admin/community/content?status=deleted', {
    headers: { authorization: `Bearer ${adminToken}` },
  }),
);
const trash = await trashResponse.json();
expect(trash.items[0]).toMatchObject({ deletionSource: 'author' });
expect(JSON.stringify(trash)).not.toContain(actors[0].userId);

const restoreResponse = await handleModerationActionRequest(
  new Request('http://localhost/api/admin/community/actions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      type: 'restore',
      targetType: 'post',
      targetId: created.id,
      reason: '작성자 삭제 복구 통합 검증',
    }),
  }),
);
expect(restoreResponse.status).toBe(204);
expect(
  (
    await handleGetPostRequest(
      new Request(`http://localhost/api/community/posts/${created.id}`),
      created.id,
    )
  ).status,
).toBe(200);
```

이 test 앞에서 service-role `auth.admin.createUser`, `community_admins` insert와 password login으로 `adminToken`을 생성한다. 등록되지 않은 email·익명 JWT의 네 관리자 read API 거부, author/admin deletion source, raw UUID 미노출, restrict/unrestrict와 audit insert도 같은 실제 local Supabase suite에서 검사한다.

- [ ] **Step 3: Release gate와 integration test의 실패 확인**

Run: `pnpm test -- tests/scripts/community-release-gate.test.ts`

Expected: FAIL until the gate validates the one-year policy.

Run: `RUN_LOCAL_SUPABASE_TESTS=true pnpm test -- tests/integration/community-security.test.ts`

Expected: FAIL on missing admin console endpoints or deletion metadata before final implementation is connected.

- [ ] **Step 4: Release gate의 1년 정책 검증 구현**

`REQUIRED_RELEASE_ENV`에 `COMMUNITY_RETENTION_DAYS`를 추가하고 `assertCommunityReleaseConfig`가 정확히 문자열 `365`인지 확인한다. `COMMUNITY_PROCESSING_RETENTION` 고지값, `COMMUNITY_RETENTION_SCHEDULE_CONFIRMED=true`, 서울 region과 관리자 등록 검사는 그대로 유지한다.

- [ ] **Step 5: 개인정보·운영·프로젝트 문서 동기화**

다음 사실만 현재 기능으로 기록한다.

- `/admin` 직접 접근과 Magic Link·관리자 allowlist.
- 신고 대기·숨김·삭제 대기·제재·운영 로그 tab.
- 작성자·관리자 삭제 구분과 모두 1년 복구 가능.
- 작성자 삭제 복구의 경고·관리 사유·이중 확인.
- 1년 뒤 자동 파기, legal hold 예외와 정식 삭제 요청 개별 검토.
- 관리자 API의 raw UUID·신고자·secret 미노출.
- 실제 실행한 test count와 검증 command.

기존 문서의 “목표 정책이며 현재 code는 30일·90일” 문구는 구현·migration·통합 test가 모두 통과한 뒤 현재 1년 정책으로 바꾼다.

- [ ] **Step 6: 전체 자동 검증 실행**

Run: `pnpm test`

Expected: all Vitest files PASS except explicitly opt-in local integration skip.

Run: `pnpm lint && pnpm build`

Expected: Oxlint exits 0 and Vinext production build exits 0.

Run: `pnpm exec supabase start && pnpm exec supabase db reset && pnpm exec supabase db lint && pnpm exec supabase test db`

Expected: reset succeeds, schema lint has no errors, all pgTAP assertions PASS.

Run: `RUN_LOCAL_SUPABASE_TESTS=true pnpm test -- tests/integration/community-security.test.ts`

Expected: real local Auth·RLS·RPC·admin console flow PASS.

- [ ] **Step 7: 실제 연결된 staging smoke test**

1. `/admin`이 `/admin/community`로 이동하는지 확인한다.
2. Magic Link로 등록된 관리자 계정에 로그인한다.
3. 작성자 삭제 test post가 공개 상세에서 404이고 `삭제 대기` tab에서 `사용자 삭제`로 보이는지 확인한다.
4. 관리 사유 입력, 경고와 이중 확인 후 복구한다.
5. 공개 상세가 200이고 운영 로그에 restore action이 남는지 확인한다.
6. 같은 글을 관리자 삭제 대기로 전환하고 `관리자 삭제` badge·파기 예정일을 확인한다.
7. 다시 복구해 test data를 공개 상태로 남긴다.
8. Light·dark mode와 mobile viewport에서 tab, modal과 긴 본문 overflow를 확인한다.

- [ ] **Step 8: Release·문서 변경 commit**

```bash
git add .env.example scripts/check-community-release.mjs tests/scripts/community-release-gate.test.ts tests/integration/community-security.test.ts docs/operations/Community_백업과_복구.md README.md CHANGELOG.md docs/product/프로젝트_소개.md docs/product/프로젝트_개발_히스토리.md docs/reference/참고자료와_선정이유.md docs/superpowers/specs/2026-09-03-익명-커뮤니티-설계.md
git commit -m "docs(community): 관리자 운영과 1년 보존 정책 동기화"
```

- [ ] **Step 9: Branch 최종 상태 확인**

Run: `git status --short --branch && git log --oneline -8`

Expected: working tree clean, six implementation commits visible, branch remains `feature/community-mvp` until review and GitFlow integration approval.

---

## Completion Checklist

- [ ] 공개 navigation에 관리자 link가 없다.
- [ ] `/admin` 직접 접근과 관리자 Magic Link login이 작동한다.
- [ ] 다섯 관리자 tab과 summary가 실제 관리자 API를 사용한다.
- [ ] 공개 API는 숨김·삭제 콘텐츠를 반환하지 않는다.
- [ ] 작성자·관리자 삭제가 구분되고 모두 1년 안에 복구된다.
- [ ] 작성자 삭제 복구에 경고·사유·이중 확인이 적용된다.
- [ ] 관리자 browser response에 raw user UUID·신고자·abuse key·secret이 없다.
- [ ] 제재 해제와 모든 관리 작업이 audit log에 기록된다.
- [ ] 1년 retention과 legal hold가 pgTAP으로 검증된다.
- [ ] 개인정보 문구·release gate·code·migration이 같은 기간을 사용한다.
- [ ] 전체 Vitest, Oxlint, production build, Supabase lint·pgTAP과 local integration이 통과한다.
- [ ] 실제 staging에서 삭제·복구·공개 노출 E2E를 확인한다.
- [ ] 문서와 CHANGELOG가 검증된 현재 상태로 갱신된다.
