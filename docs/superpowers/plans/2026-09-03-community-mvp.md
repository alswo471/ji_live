# Community MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가입 화면 없이 글과 댓글을 작성하고 신고·관리할 수 있으며 개인정보와 공개 write 경계를 최소화한 지투라이브 community MVP를 만든다.

**Architecture:** 브라우저는 Supabase anonymous Auth로 JWT만 발급받고, 모든 write 요청은 Vinext API route가 JWT·Turnstile·입력값·rate limit을 검증한 뒤 server secret으로 수행한다. Supabase 공개 key의 table write는 전부 차단하고 공개 상태의 글·댓글 read만 허용하며, market data subsystem과 community data를 분리한다.

**Tech Stack:** React 19, TypeScript, Vinext, Vite 8, Vitest, Tailwind CSS 4, Supabase Postgres/Auth, Cloudflare Turnstile

**Spec:** `docs/superpowers/specs/2026-09-03-익명-커뮤니티-설계.md`

## Execution Status (2026-09-03)

| Task                                       | Status    |
| ------------------------------------------ | --------- |
| 1. Worktree·Supabase configuration         | Completed |
| 2. Schema·RLS·atomic abuse controls        | Completed |
| 3. Auth·Turnstile·validation·HMAC          | Completed |
| 4. Public read API                         | Completed |
| 5. API-only write·delete·report            | Completed |
| 6. Anonymous session·Community UI          | Completed |
| 7. Moderation console·admin authentication | Completed |
| 8. Legal/retention·release gate            | Completed |
| 9. End-to-end security·staging gate        | Next      |

## Global Constraints

- Implementation worktree는 `develop`의 v0.4.0에서 `feature/community-mvp`로 생성한다.
- 현재 planning branch는 v0.4.0 이전 commit에서 갈라졌으므로 branch 전체를 `develop`에 merge하지 않는다. spec과 plan 파일만 새 feature branch로 가져온다.
- 공개 사용자는 email, phone, real name 입력 없이 Supabase anonymous Auth만 사용한다.
- 게시글은 plain text와 HTTPS external link 1개만 지원하고 image·file upload·rich HTML·URL shortener는 허용하지 않는다.
- 모든 `INSERT`, `UPDATE`, `DELETE`는 application API를 통해서만 수행하며 browser의 Supabase direct write는 거부한다.
- 원본 IP는 application DB에 저장하지 않고, daily HMAC abuse key는 생성 후 24시간 안에 파기한다.
- 일반 신고는 유효한 서로 다른 사용자와 abuse key가 각각 10개 누적될 때 임시 숨김한다. `privacy`와 `illegal` 신고는 1건에서 임시 숨김한다.
- deleted content는 30일, 종료된 report·moderation 기록은 90일 후 파기한다.
- Realtime, direct message, paid recommendation, user-to-user trading과 image upload는 이 plan에서 제외한다.
- server secret, Turnstile secret과 HMAC secret은 browser bundle, response, log와 Git history에 포함하지 않는다.
- 기술 식별자와 표준 용어는 영어 원문을 사용하고 UI 안내·오류 문구는 자연스러운 한국어로 작성한다.
- community는 release gate가 통과하기 전까지 production navigation에서 비활성화한다.
- 각 task의 user-visible 또는 운영상 변경은 `CHANGELOG.md`, `README.md`, 개발 히스토리와 References 중 실제 영향이 있는 문서에 같은 commit으로 반영한다.

---

### Task 1: Isolated Worktree와 Supabase Configuration

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `.env.example`
- Create: `lib/community/config.ts`
- Create: `lib/community/supabase.ts`
- Create: `tests/community/config.test.ts`
- Import: `docs/superpowers/specs/2026-09-03-익명-커뮤니티-설계.md`
- Import: `docs/superpowers/plans/2026-09-03-community-mvp.md`

**Interfaces:**

- Produces: `getCommunityPublicConfig(): CommunityPublicConfig`
- Produces: `getCommunityServerConfig(): CommunityServerConfig`
- Produces: `isCommunityEnabled(): boolean`
- Produces: `getBrowserSupabase(): SupabaseClient`
- Produces: `getServerSupabase(): SupabaseClient`

- [ ] **Step 1: Create the isolated worktree from current `develop`**

Run from the repository root after invoking `using-git-worktrees`:

```bash
git fetch origin
git worktree add .worktrees/community-mvp -b feature/community-mvp develop
cd .worktrees/community-mvp
git checkout feature/market-dashboard-v1-design -- \
  docs/superpowers/specs/2026-09-03-익명-커뮤니티-설계.md \
  docs/superpowers/plans/2026-09-03-community-mvp.md
```

Expected: `git status --short --branch` shows `feature/community-mvp` and only the two imported planning files.

- [ ] **Step 2: Write failing configuration tests**

Create `tests/community/config.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import {
  getCommunityPublicConfig,
  getCommunityServerConfig,
} from '@/lib/community/config';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('community config', () => {
  it('returns validated public config', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key';
    expect(getCommunityPublicConfig()).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_test',
      turnstileSiteKey: 'site-key',
    });
  });

  it('never accepts a missing server secret', () => {
    delete process.env.SUPABASE_SECRET_KEY;
    expect(() => getCommunityServerConfig()).toThrow('SUPABASE_SECRET_KEY');
  });
});
```

- [ ] **Step 3: Run the focused test and verify failure**

Run: `pnpm test -- tests/community/config.test.ts`

Expected: FAIL because `lib/community/config.ts` does not exist.

- [ ] **Step 4: Add Supabase dependency and explicit environment contract**

Run: `pnpm add @supabase/supabase-js`

Create `.env.example` with names only; do not place usable secrets in it:

```dotenv
NEXT_PUBLIC_COMMUNITY_ENABLED=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
NEXT_PUBLIC_RIGHTS_CONTACT_URL=
SUPABASE_SECRET_KEY=
TURNSTILE_SECRET_KEY=
COMMUNITY_HMAC_SECRET=
COMMUNITY_RETENTION_SECRET=
SUPABASE_PROJECT_REF=
SUPABASE_ACCESS_TOKEN=
```

Implement `lib/community/config.ts` with URL validation and separate public/server return types. `getCommunityPublicConfig()` must only return the three `NEXT_PUBLIC_*` Supabase/Turnstile values. `getCommunityServerConfig()` must return `supabaseUrl`, `supabaseSecretKey`, `turnstileSecretKey`, and `communityHmacSecret`; its error must name only the missing variable, never its value. `isCommunityEnabled()` returns `true` only when `NEXT_PUBLIC_COMMUNITY_ENABLED === 'true'`; routes and navigation remain unavailable otherwise.

- [ ] **Step 5: Add isolated Supabase client factories**

Implement `lib/community/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getCommunityPublicConfig, getCommunityServerConfig } from './config';

let browserClient: SupabaseClient | undefined;

export function getBrowserSupabase() {
  const config = getCommunityPublicConfig();
  browserClient ??= createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
  );
  return browserClient;
}

export function getServerSupabase() {
  const config = getCommunityServerConfig();
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 6: Run tests and production checks**

Run: `pnpm test -- tests/community/config.test.ts && pnpm lint && pnpm build`

Expected: all commands exit 0 with community disabled by default.

- [ ] **Step 7: Commit the foundation**

```bash
git add package.json pnpm-lock.yaml .env.example lib/community/config.ts lib/community/supabase.ts tests/community/config.test.ts docs/superpowers
git commit -m "chore(community): Supabase 환경 경계와 작업 문서 추가"
```

---

### Task 2: Database Schema, RLS와 Atomic Abuse Controls

**Files:**

- Create: `supabase/config.toml`
- Create: `supabase/migrations/202609030001_community_schema.sql`
- Create: `tests/community/migration-contract.test.ts`
- Modify: `docs/reference/참고자료와_선정이유.md`

**Interfaces:**

- Produces tables: `community_profiles`, `community_posts`, `community_comments`, `community_reports`, `community_sanctions`, `community_moderation_actions`, `community_rate_events`, `community_admins`
- Produces RPC: `consume_community_rate_limit(uuid, text, text, integer, integer): boolean`
- Produces RPC: `submit_community_report(uuid, text, text, uuid, text, text): jsonb`

- [ ] **Step 1: Write a failing migration contract test**

Create `tests/community/migration-contract.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/202609030001_community_schema.sql',
  'utf8',
);

describe('community migration contract', () => {
  it.each([
    'community_posts',
    'community_comments',
    'community_reports',
    'community_admins',
  ])('enables RLS on %s', (table) =>
    expect(sql).toContain(
      `alter table public.${table} enable row level security`,
    ),
  );

  it('revokes browser write access', () => {
    expect(sql).toContain('revoke insert, update, delete');
    expect(sql).toContain('from anon, authenticated');
  });

  it('keeps ten-report and urgent-hide rules in the database transaction', () => {
    expect(sql).toContain('valid_report_count >= 10');
    expect(sql).toContain("p_reason in ('privacy', 'illegal')");
  });
});
```

- [ ] **Step 2: Run the contract test and verify failure**

Run: `pnpm test -- tests/community/migration-contract.test.ts`

Expected: FAIL because the migration file is missing.

- [ ] **Step 3: Create the schema with strict constraints**

Create one migration containing:

```sql
create type public.community_content_status as enum ('visible', 'hidden', 'deleted');
create type public.community_report_reason as enum (
  'privacy', 'illegal', 'copyright', 'harassment', 'spam',
  'financial_solicitation', 'other'
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete restrict,
  author_name text not null check (char_length(author_name) between 2 and 24),
  title text not null check (char_length(title) between 2 and 80),
  body text not null check (char_length(body) between 1 and 3000),
  link_url text check (link_url is null or link_url ~ '^https://'),
  idempotency_key uuid not null unique,
  status public.community_content_status not null default 'visible',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

Use equivalent foreign keys and length constraints for comments. Reports must require exactly one target (`post_id` XOR `comment_id`), include `reporter_id`, `reporter_abuse_key`, `reason`, `detail`, `status`, and partial unique indexes preventing one user from reporting the same target twice. Admin, sanction, moderation and rate-event tables must not expose rows to browser roles.

- [ ] **Step 4: Add deny-by-default grants and RLS**

For every table, enable and force RLS. Grant browser roles column-limited `SELECT` only for visible post/comment feed data and revoke direct writes:

```sql
revoke all on public.community_posts from anon, authenticated;
grant select (id, author_name, title, body, link_url, status, created_at)
  on public.community_posts to anon, authenticated;
revoke insert, update, delete on public.community_posts from anon, authenticated;

create policy community_posts_visible_read
on public.community_posts for select
to anon, authenticated
using (status = 'visible');
```

Apply the same principle to comments. Do not create browser policies for reports, sanctions, moderation actions, rate events or admins.

- [ ] **Step 5: Add atomic rate-limit and report RPCs**

`consume_community_rate_limit` must delete events older than 24 hours, count both `actor_id` and `abuse_key` in the requested window, insert only when both counts are below `p_limit`, and return `false` otherwise. `submit_community_report` must insert once, count distinct reporter IDs and distinct abuse keys, and atomically set the target to `hidden` when both counts reach 10 or the reason is `privacy`/`illegal`.

Both functions must use a fixed `search_path`, reject null/empty identifiers, and be callable only by `service_role`:

```sql
revoke all on function public.consume_community_rate_limit(uuid, text, text, integer, integer) from public;
grant execute on function public.consume_community_rate_limit(uuid, text, text, integer, integer) to service_role;
```

- [ ] **Step 6: Validate SQL locally**

Run:

```bash
pnpm dlx supabase start
pnpm dlx supabase db reset
pnpm dlx supabase db lint --local
pnpm test -- tests/community/migration-contract.test.ts
```

Expected: migration applies from an empty local database, DB lint reports no blocking errors, and the contract test passes. Stop the local stack with `pnpm dlx supabase stop` after verification.

- [ ] **Step 7: Record official references and commit**

Add a 2026-09-03 section to `docs/reference/참고자료와_선정이유.md` linking Supabase anonymous Auth, RLS, CAPTCHA, rate-limit, region, backup and DPA documents. Record what each source supports and that Seoul primary storage does not by itself prove Korean legal compliance.

```bash
git add supabase tests/community/migration-contract.test.ts docs/reference/참고자료와_선정이유.md
git commit -m "feat(community): 게시판 schema와 RLS 보안 정책 추가"
```

---

### Task 3: Authentication, Turnstile, Validation과 Abuse Key

**Files:**

- Create: `lib/community/types.ts`
- Create: `lib/community/auth.ts`
- Create: `lib/community/turnstile.ts`
- Create: `lib/community/abuse-key.ts`
- Create: `lib/community/nickname.ts`
- Create: `lib/community/validation.ts`
- Create: `tests/community/auth.test.ts`
- Create: `tests/community/turnstile.test.ts`
- Create: `tests/community/abuse-key.test.ts`
- Create: `tests/community/nickname.test.ts`
- Create: `tests/community/validation.test.ts`

**Interfaces:**

- Produces: `authenticateCommunityUser(request: Request): Promise<CommunityActor>`
- Produces: `verifyTurnstile(token: string, remoteIp?: string): Promise<boolean>`
- Produces: `createDailyAbuseKey(ip: string, now?: Date): Promise<string>`
- Produces: `createAnonymousName(actorId: string): Promise<string>`
- Produces: `validatePostInput(value: unknown): PostInput`
- Produces: `validateCommentInput(value: unknown): CommentInput`
- Produces: `validateReportInput(value: unknown): ReportInput`

- [ ] **Step 1: Define public types and failing validation tests**

Define exact limits in `lib/community/types.ts`:

```ts
export const COMMUNITY_LIMITS = {
  titleMin: 2,
  titleMax: 80,
  bodyMax: 3000,
  commentMax: 1000,
  reportDetailMax: 500,
} as const;

export type ReportReason =
  | 'privacy'
  | 'illegal'
  | 'copyright'
  | 'harassment'
  | 'spam'
  | 'financial_solicitation'
  | 'other';

export interface PostInput {
  title: string;
  body: string;
  linkUrl: string | null;
  idempotencyKey: string;
}
```

Tests must reject HTML tags, `javascript:`/`data:`/`http:` URLs, known shorteners (`bit.ly`, `t.co`, `tinyurl.com`), more than one URL in body plus link field, invalid UUID idempotency keys, oversized text and unknown report reasons. Valid input must be trimmed without mutating internal line breaks.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm test -- tests/community/validation.test.ts`

Expected: FAIL because validators are missing.

- [ ] **Step 3: Implement validators with explicit Korean errors**

Use a `CommunityInputError` carrying `code` and safe Korean `message`. Parse unknown values without type assertions at the API boundary. Never render submitted content as HTML; UI uses normal React text nodes.

```ts
export class CommunityInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
```

- [ ] **Step 4: Write authentication and Turnstile tests**

Test missing/malformed bearer tokens as 401-equivalent errors, anonymous JWT success, permanent non-admin user rejection from public community write, Turnstile timeout/failure as `false`, and secret/value omission from errors.

- [ ] **Step 5: Implement verified actor and Turnstile adapters**

`authenticateCommunityUser` calls `getServerSupabase().auth.getUser(accessToken)` and returns only:

```ts
export interface CommunityActor {
  id: string;
  isAnonymous: boolean;
  email: string | null;
}
```

Public write requires `is_anonymous === true`. `verifyTurnstile` POSTs form data to `https://challenges.cloudflare.com/turnstile/v0/siteverify`, applies a 3-second abort timeout, and accepts only `{ success: true }`.

- [ ] **Step 6: Implement a rotating HMAC abuse key**

Normalize the trusted client IP selected by the deployment adapter, import `COMMUNITY_HMAC_SECRET` into Web Crypto HMAC-SHA-256, and sign `${YYYY-MM-DD}:${ip}`. Return lower-case hex. Tests must prove same-day stability, next-day rotation and no raw IP substring in the output.

Use the same secret through a separate HMAC input namespace `nickname:${actorId}` to select one adjective, one animal and four decimal digits in `createAnonymousName`. The result must be stable for the same anonymous account, must not contain any UUID substring, and must match `^[가-힣]+-[가-힣]+-[0-9]{4}$`. Add a focused test proving these properties.

- [ ] **Step 7: Run focused and full tests, then commit**

Run: `pnpm test -- tests/community && pnpm lint`

```bash
git add lib/community tests/community
git commit -m "feat(community): anonymous auth와 write 검증 계층 추가"
```

---

### Task 4: Public Read API와 Repository

**Files:**

- Create: `lib/community/repository.ts`
- Create: `lib/community/read-service.ts`
- Create: `app/api/community/posts/route.ts`
- Create: `app/api/community/posts/[id]/route.ts`
- Create: `app/api/community/posts/[id]/comments/route.ts`
- Create: `tests/community/read-service.test.ts`
- Create: `tests/api/community-read-routes.test.ts`

**Interfaces:**

- Produces: `listPosts(cursor: string | null, limit: number): Promise<PostPage>`
- Produces: `getPost(id: string): Promise<CommunityPostDetail | null>`
- Produces: `listComments(postId: string, cursor: string | null, limit: number): Promise<CommentPage>`
- API: `GET /api/community/posts?cursor=<opaque>&limit=20`
- API: `GET /api/community/posts/:id`
- API: `GET /api/community/posts/:id/comments?cursor=<opaque>&limit=30`

- [ ] **Step 1: Write failing repository/service tests**

Use injected repository fakes. Verify newest-first ordering, `limit` clamped to 1–30, opaque cursor rejection, hidden/deleted rows never returned, and response DTOs omit `author_id`, abuse key, reporter and internal moderation fields. When a valid optional bearer token is present, post/comment detail DTOs may include only a computed `canDelete` boolean; they still omit the owner UUID.

Expected DTO shape:

```ts
export interface CommunityPostSummary {
  id: string;
  authorName: string;
  title: string;
  excerpt: string;
  linkUrl: string | null;
  commentCount: number;
  createdAt: string;
}
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm test -- tests/community/read-service.test.ts tests/api/community-read-routes.test.ts`

Expected: FAIL because read service and routes are missing.

- [ ] **Step 3: Implement explicit-column repository queries**

Every Supabase query must list columns explicitly. Do not use `select('*')`. Convert database `snake_case` rows to public camelCase DTOs inside `repository.ts`. Use `(created_at,id)` cursor pagination so equal timestamps do not duplicate or skip rows.

- [ ] **Step 4: Implement injectable route handlers**

Follow the existing candle route test pattern:

```ts
export async function handleListPostsRequest(
  request: Request,
  load: typeof listPosts = listPosts,
) {
  // validate query, load page, return no-store JSON
}
```

When `isCommunityEnabled()` is false, every community route returns 404 without opening a Supabase connection. Invalid IDs/cursors return 400, missing visible content returns 404, provider failure returns a generic 503 without database details, and all responses use `Cache-Control: no-store`.

- [ ] **Step 5: Run route, regression and build checks**

Run: `pnpm test -- tests/community/read-service.test.ts tests/api/community-read-routes.test.ts && pnpm test && pnpm build`

Expected: all commands exit 0 and existing market routes remain unchanged.

- [ ] **Step 6: Commit public reads**

```bash
git add lib/community app/api/community tests/community tests/api/community-read-routes.test.ts
git commit -m "feat(community): 공개 게시글과 댓글 조회 API 추가"
```

---

### Task 5: API-only Post, Comment, Delete와 Report Writes

**Files:**

- Create: `lib/community/write-service.ts`
- Modify: `app/api/community/posts/route.ts`
- Modify: `app/api/community/posts/[id]/route.ts`
- Modify: `app/api/community/posts/[id]/comments/route.ts`
- Create: `app/api/community/comments/[id]/route.ts`
- Create: `app/api/community/reports/route.ts`
- Create: `tests/community/write-service.test.ts`
- Create: `tests/api/community-write-routes.test.ts`

**Interfaces:**

- Produces: `createPost(actor, input, context): Promise<CommunityPostDetail>`
- Produces: `createComment(actor, postId, input, context): Promise<CommunityComment>`
- Produces: `deletePost(actor, postId): Promise<void>`
- Produces: `deleteComment(actor, commentId): Promise<void>`
- Produces: `reportContent(actor, input, context): Promise<ReportReceipt>`
- Consumes: Task 2 RPCs and Task 3 authentication/validation/security functions

- [ ] **Step 1: Write failing write-service tests**

Cover these exact cases:

```ts
it.each([
  ['post', 3, 600],
  ['comment', 10, 600],
  ['report', 10, 3600],
])(
  '%s consumes the configured atomic rate limit',
  async (action, limit, windowSeconds) => {
    // assert repository.consumeRateLimit receives the exact tuple
  },
);
```

Also verify: JWT actor ID overrides any body author ID, non-owner delete is 403, idempotency returns the existing row, one user cannot report twice, general report 9 remains visible, general report 10 hides, and privacy/illegal report 1 hides.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm test -- tests/community/write-service.test.ts tests/api/community-write-routes.test.ts`

Expected: FAIL because the write service/routes are missing.

- [ ] **Step 3: Implement one guarded request pipeline**

Every modifying handler performs this order:

```ts
const actor = await authenticateCommunityUser(request);
const turnstileToken = request.headers.get('x-turnstile-token') ?? '';
if (!(await verifyTurnstile(turnstileToken, clientIp)))
  throw new CommunityHttpError(403, '사람인지 확인하지 못했습니다.');
const abuseKey = await createDailyAbuseKey(clientIp);
const input = validatePostInput(await request.json());
return createPost(actor, input, { abuseKey });
```

Do not log request bodies, JWTs, IPs, Turnstile tokens or Supabase error payloads. Server logs contain a generated request ID and safe error code only.

On the actor's first successful write, upsert `community_profiles` with `createAnonymousName(actor.id)` and copy that stable display name into the new post/comment row. Never accept `author_name` from request JSON.

- [ ] **Step 4: Implement ownership and soft deletion**

Fetch only `id,author_id,status` before delete. Reject mismatched actors with 403. Set `status='deleted'` and `deleted_at=now()`; do not hard-delete in the request path. Deleting a post hides its comments from public reads.

- [ ] **Step 5: Implement atomic reporting**

Call `submit_community_report` once with the verified actor ID and daily abuse key. Return only:

```ts
export interface ReportReceipt {
  accepted: true;
  temporarilyHidden: boolean;
}
```

Do not expose report count, reporter identities or moderation state beyond the submitted target's temporary hiding result.

- [ ] **Step 6: Verify direct Supabase write rejection**

Against local Supabase, use the publishable/anon key to attempt `INSERT`, `UPDATE`, and `DELETE` on posts/comments/reports. Each must fail with permission/RLS denial. Then verify the application API succeeds with a valid anonymous JWT and Turnstile test token.

- [ ] **Step 7: Run all tests and commit**

Run: `pnpm test && pnpm lint && pnpm build`

```bash
git add lib/community app/api/community tests/community tests/api/community-write-routes.test.ts
git commit -m "feat(community): 검증된 API-only 게시글 write 흐름 추가"
```

---

### Task 6: Anonymous Session과 Community User Interface

**Required implementation skill:** `ui-ux-pro-max`

**Files:**

- Create: `hooks/use-community-session.ts`
- Create: `hooks/use-community-posts.ts`
- Create: `components/community/turnstile-challenge.tsx`
- Create: `components/community/community-feed.tsx`
- Create: `components/community/post-form.tsx`
- Create: `components/community/comment-list.tsx`
- Create: `components/community/comment-form.tsx`
- Create: `components/community/report-dialog.tsx`
- Create: `components/site/site-header.tsx`
- Create: `app/community/page.tsx`
- Create: `app/community/[id]/page.tsx`
- Modify: `app/page.tsx`
- Create: `tests/hooks/use-community-session.test.tsx`
- Create: `tests/components/community-feed.test.tsx`
- Create: `tests/components/post-form.test.tsx`
- Create: `tests/components/report-dialog.test.tsx`

**Interfaces:**

- Produces: `useCommunitySession(): CommunitySessionState`
- Produces: `useCommunityPosts(): CommunityPostsState`
- Produces: `TurnstileChallenge.execute(): Promise<string>`
- Consumes: Tasks 4–5 community APIs

- [ ] **Step 1: Write anonymous session hook tests**

Mock `getBrowserSupabase`. Verify existing session reuse, `signInAnonymously({ options: { captchaToken } })`, loading/error states, and no repeated account creation during React re-render.

- [ ] **Step 2: Run the hook test and verify failure**

Run: `pnpm test -- tests/hooks/use-community-session.test.tsx`

Expected: FAIL because the hook is missing.

- [ ] **Step 3: Implement Turnstile and anonymous session**

Load the official Turnstile script once, render an accessible challenge container, reset expired tokens, and never persist tokens. `useCommunitySession` must reuse a valid Supabase session and create an anonymous account only after a Turnstile token exists.

- [ ] **Step 4: Write component behavior tests**

Verify:

- feed loading, empty, error and paginated states
- title `2–80`, body `1–3000`, comment `1–1000` counters
- plain text rendering of `<script>alert(1)</script>`
- HTTPS link domain display without remote image/preview scraping
- browser-data-loss ownership warning before first post
- disabled submit during request and idempotency key reuse on retry
- report reason selection and success message
- mobile keyboard navigation and visible focus

- [ ] **Step 5: Add a shared site header with two active destinations**

Extract only the existing brand/display controls needed by both pages into `components/site/site-header.tsx`. Navigation contains `마켓` and `커뮤니티`; future 한국주식·미국주식·ETF·뉴스 destinations are not introduced in this task. Keep the existing market dashboard behavior and theme controls unchanged.

- [ ] **Step 6: Implement feed and detail pages**

`/community` shows the latest feed, write form and pagination. `/community/[id]` shows post content, external link, comments, delete controls only for the local actor, and report actions. Use semantic `article`, heading order, label/error associations, minimum 44px interaction targets and the existing light/dark design tokens.

- [ ] **Step 7: Run UI tests and visual regression checks**

Run: `pnpm test -- tests/hooks/use-community-session.test.tsx tests/components/community-feed.test.tsx tests/components/post-form.test.tsx tests/components/report-dialog.test.tsx`

Then run `pnpm dev -- --hostname 0.0.0.0` and manually verify 375px, 768px and 1440px widths in light/dark mode. Expected: no horizontal overflow, no content flash as HTML, and all loading/error states remain readable.

- [ ] **Step 8: Update user-visible docs and commit**

Add the disabled-by-default community MVP to `CHANGELOG.md` under Unreleased and record the UI/security decisions in `docs/product/프로젝트_개발_히스토리.md`.

```bash
git add app components/community components/site hooks tests CHANGELOG.md docs/product/프로젝트_개발_히스토리.md
git commit -m "feat(community): 익명 게시글과 댓글 UI 추가"
```

---

### Task 7: Moderation Console과 Admin Authentication

**Files:**

- Create: `lib/community/admin-auth.ts`
- Create: `lib/community/moderation-service.ts`
- Create: `app/admin/community/page.tsx`
- Create: `app/api/admin/community/reports/route.ts`
- Create: `app/api/admin/community/actions/route.ts`
- Create: `components/community/admin-login.tsx`
- Create: `components/community/moderation-queue.tsx`
- Create: `tests/community/admin-auth.test.ts`
- Create: `tests/community/moderation-service.test.ts`
- Create: `tests/api/community-admin-routes.test.ts`
- Create: `tests/community/moderation-migration-contract.test.ts`
- Create: `tests/components/admin-login.test.tsx`
- Create: `tests/components/moderation-queue.test.tsx`
- Create: `supabase/migrations/202609030002_community_moderation.sql`
- Create: `supabase/tests/community_moderation.test.sql`
- Modify: `lib/community/write-service.ts`
- Modify: `tests/community/write-service.test.ts`

**Interfaces:**

- Produces: `requireCommunityAdmin(request: Request): Promise<CommunityAdmin>`
- Produces: `listModerationQueue(cursor: string | null): Promise<ModerationPage>`
- Produces: `moderateContent(admin, input): Promise<void>`
- API: `GET /api/admin/community/reports`
- API: `POST /api/admin/community/actions`

- [x] **Step 1: Write failing admin authorization tests**

Cover anonymous JWT rejection, authenticated permanent user without `community_admins` row rejection, configured admin success, expired sanction handling, and response/log omission of admin email and access token.

- [x] **Step 2: Run focused tests and verify failure**

Run: `pnpm test -- tests/community/admin-auth.test.ts tests/community/moderation-service.test.ts tests/api/community-admin-routes.test.ts`

Expected: FAIL because admin modules are missing.

- [x] **Step 3: Implement admin-only authentication**

The admin page supports Supabase email OTP for the site owner only. `requireCommunityAdmin` verifies the JWT and then an active `community_admins.user_id` row. Public users never see email login and cannot self-enroll as admins. Initial admin UUID is inserted manually in Supabase Dashboard after the owner's email account is created; no bootstrap endpoint is exposed.

- [x] **Step 4: Implement moderation actions**

Allowed action input is a closed union:

```ts
export type ModerationAction =
  | {
      type: 'hide';
      targetType: 'post' | 'comment';
      targetId: string;
      reason: string;
    }
  | {
      type: 'restore';
      targetType: 'post' | 'comment';
      targetId: string;
      reason: string;
    }
  | {
      type: 'delete';
      targetType: 'post' | 'comment';
      targetId: string;
      reason: string;
    }
  | { type: 'restrict'; userId: string; until: string; reason: string };
```

Validate reason length `5–500`, record every action in `community_moderation_actions`, and update report status in the same operation. UI requires confirmation for delete/restrict and shows no public reporter identity.

- [x] **Step 5: Verify authorization and audit behavior**

Run the focused tests, then locally attempt each admin endpoint with no JWT, anonymous JWT, non-admin permanent JWT and admin JWT. Expected statuses: 401, 403, 403 and 200. Confirm each successful mutation creates one audit row.

- [x] **Step 6: Commit moderation**

```bash
git add lib/community app/admin app/api/admin components/community tests/community tests/api/community-admin-routes.test.ts
git commit -m "feat(community): 신고 검토와 moderation console 추가"
```

---

### Task 8: Legal Pages, Retention Job와 Free-tier Backup

**Files:**

- Create: `lib/legal/community-policy.ts`
- Create: `app/legal/privacy/page.tsx`
- Create: `app/legal/terms/page.tsx`
- Create: `app/legal/community-guidelines/page.tsx`
- Create: `app/legal/rights/page.tsx`
- Create: `components/site/site-footer.tsx`
- Create: `app/api/internal/community-retention/route.ts`
- Create: `scripts/check-community-release.mjs`
- Create: `scripts/backup-community-db.sh`
- Modify: `package.json`
- Modify: `app/page.tsx`
- Modify: `app/community/page.tsx`
- Create: `tests/legal/community-policy.test.ts`
- Create: `tests/api/community-retention-route.test.ts`
- Create: `tests/scripts/community-release-gate.test.ts`
- Create: `supabase/migrations/202609030003_community_retention.sql`
- Create: `supabase/tests/community_retention.test.sql`
- Create: `app/about/page.tsx`
- Create: `components/site/legal-document.tsx`
- Create: `docs/operations/Community_백업과_복구.md`

**Interfaces:**

- Produces: `COMMUNITY_RETENTION_POLICY`
- Produces: `assertCommunityReleaseConfig(env): void`
- API: `POST /api/internal/community-retention` protected by server-only scheduler secret

- [x] **Step 1: Write failing policy and release-gate tests**

Tests must assert exact `24 hours`, `30 days`, `90 days` retention values; required privacy sections; links to terms/guidelines/rights pages; and release rejection when any of these are absent:

```ts
const REQUIRED_RELEASE_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'NEXT_PUBLIC_RIGHTS_CONTACT_URL',
  'SUPABASE_SECRET_KEY',
  'TURNSTILE_SECRET_KEY',
  'COMMUNITY_HMAC_SECRET',
  'COMMUNITY_RETENTION_SECRET',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_ACCESS_TOKEN',
] as const;
```

The contact URL must be HTTPS. The release script must call Supabase Management API `GET /v1/projects/{SUPABASE_PROJECT_REF}` with the protected release-only access token and assert that the returned region equals `ap-northeast-2`; a generic APAC region is rejected. `SUPABASE_ACCESS_TOKEN` is used only by the release check and is not copied into the application runtime environment.

- [x] **Step 2: Run tests and verify failure**

Run: `pnpm test -- tests/legal/community-policy.test.ts tests/api/community-retention-route.test.ts tests/scripts/community-release-gate.test.ts`

Expected: FAIL because policy, route and release script are missing.

- [x] **Step 3: Implement legal pages from one typed policy source**

Create clear Korean pages covering processing purpose/items/legal basis/retention/destruction, data-subject requests, security measures, processor/overseas-processing facts, operator contact, content rules, copyright/rights requests and investment-information limitations. Do not claim that a disclaimer legalizes unlicensed market data, copied news or unlawful advice.

Before enabling production, compare displayed processor and overseas-processing fields against the then-current Supabase DPA, subprocessor list and project settings. If the legal entity, country, processing purpose, transfer method or retention period is not verified, `check:community-release` must fail rather than publish guessed text.

- [x] **Step 4: Implement retention deletion with fail-closed authentication**

The internal route uses a constant-time comparison against `COMMUNITY_RETENTION_SECRET`, then deletes:

- `community_rate_events.created_at < now() - interval '24 hours'`
- soft-deleted posts/comments with `deleted_at < now() - interval '30 days'` and no active legal hold
- resolved/dismissed reports and moderation actions older than `90 days` and no active legal hold
- anonymous Auth users inactive 90 days with no public content or active report

Return counts only. Never return deleted content, user IDs or access credentials.

- [x] **Step 5: Add free-tier backup command**

`scripts/backup-community-db.sh` must use `supabase db dump`, write to an operator-selected directory argument, create files with restrictive permissions, and refuse workspace/root/home-directory destinations. It must not commit dumps. Document a weekly encrypted off-site backup procedure because Supabase Free does not include automatic backups.

- [x] **Step 6: Add footer and release gate**

`SiteFooter` links privacy, terms, guidelines, rights/contact and project introduction pages. Keep `NEXT_PUBLIC_COMMUNITY_ENABLED=false` until the real rights-contact URL, Supabase project, Turnstile keys, admin account, retention scheduler and displayed processing facts pass:

Run: `pnpm check:community-release`

Expected before real configuration: non-zero exit naming missing variable names only. Expected in configured staging: exit 0.

- [x] **Step 7: Verify and commit legal/operations support**

Run: `pnpm test && pnpm lint && pnpm build`

```bash
git add lib/legal app/legal app/api/internal components/site scripts tests package.json pnpm-lock.yaml README.md CHANGELOG.md docs
git commit -m "feat(community): privacy 정책과 운영 release gate 추가"
```

---

### Task 9: End-to-end Security Verification, Documentation과 Staging Gate

**Files:**

- Create: `tests/integration/community-security.test.ts`
- Modify: `.github/workflows/quality.yml`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/README.md`
- Modify: `docs/product/프로젝트_소개.md`
- Modify: `docs/product/프로젝트_개발_히스토리.md`
- Modify: `docs/reference/참고자료와_선정이유.md`

**Interfaces:**

- Consumes all prior tasks
- Produces a disabled-by-default, staging-verifiable community build and operational checklist

- [ ] **Step 1: Write integration security tests against local Supabase**

Create two anonymous users, one permanent non-admin and one seeded admin. Prove:

1. anon/public direct table write is denied;
2. API post/comment succeeds only with valid JWT + Turnstile;
3. actor A cannot delete actor B content;
4. the same actor or same daily abuse key cannot inflate report count;
5. the tenth valid general report hides content;
6. the first privacy/illegal report temporarily hides content;
7. non-admin moderation is denied;
8. hidden/deleted content disappears from public reads;
9. retention removes only expired, non-held records;
10. API responses never contain `author_id`, raw IP, abuse key, reporter ID or secrets.

- [ ] **Step 2: Run the complete local security suite**

Run:

```bash
pnpm dlx supabase start
pnpm dlx supabase db reset
pnpm test
pnpm lint
pnpm build
pnpm dlx supabase db lint --local
pnpm dlx supabase stop
```

Expected: every command exits 0. Record exact results; do not replace failed integration checks with mocks.

- [ ] **Step 3: Extend CI without requiring production secrets**

Keep community disabled in generic CI. Add unit tests, migration contract checks and secret-pattern scanning. Do not run production release gate in pull-request CI without protected environment values; run it in the Oracle deployment job immediately before enabling community.

- [ ] **Step 4: Synchronize project documentation**

Update current capability and setup in `README.md`, add this spec/plan to `docs/README.md`, add community scope and exclusions to `프로젝트_소개.md`, and record purpose, rejected direct-write design, 10-report decision, legal limitations, operational burden and future review conditions in `프로젝트_개발_히스토리.md`. Record only checks that actually ran.

- [ ] **Step 5: Perform configured staging review**

With the owner-supplied HTTPS rights-contact URL and a Seoul Supabase project:

```bash
pnpm check:community-release
pnpm dev -- --hostname 0.0.0.0
```

Manually verify anonymous first visit, refresh persistence, post/comment/delete/report, admin moderation, light/dark mode, 375px mobile and keyboard-only navigation. Verify Supabase Dashboard shows no raw IP column and no public write policy.

- [ ] **Step 6: Final atomic commit**

```bash
git add .github tests/integration README.md CHANGELOG.md docs
git commit -m "test(community): security 검증과 운영 문서 정리"
```

- [ ] **Step 7: Prepare review without merging or releasing**

Run:

```bash
git status --short
git log --oneline develop..HEAD
git diff --stat develop...HEAD
```

Expected: clean worktree and only community-related commits/files. Request code review. Push, merge into `develop`, create a release branch, enable production or tag a release only after explicit user approval.
