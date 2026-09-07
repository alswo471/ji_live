import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleModerationActionRequest } from '@/app/api/admin/community/actions/route';
import { handleAdminAuditRequest } from '@/app/api/admin/community/audit/route';
import { handleAdminContentRequest } from '@/app/api/admin/community/content/route';
import { handleListModerationReportsRequest } from '@/app/api/admin/community/reports/route';
import { handleAdminSanctionsRequest } from '@/app/api/admin/community/sanctions/route';
import {
  handleCreatePostRequest,
  handleListPostsRequest,
} from '@/app/api/community/posts/route';
import {
  handleDeletePostRequest,
  handleGetPostRequest,
} from '@/app/api/community/posts/[id]/route';
import { handleReportRequest } from '@/app/api/community/reports/route';

const runIntegration = process.env.RUN_LOCAL_SUPABASE_TESTS === 'true';
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';
const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

type LocalEnvironment = {
  API_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
};

function localEnvironment(): LocalEnvironment {
  const output = execFileSync(
    'pnpm',
    ['dlx', 'supabase', 'status', '-o', 'env'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  return Object.fromEntries(
    output
      .split('\n')
      .map((line) => /^([A-Z_]+)="(.*)"$/.exec(line))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => [match[1], match[2]]),
  ) as LocalEnvironment;
}

async function anonymousSession(url: string, key: string) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) throw new Error('local anonymous auth failed');
  return {
    client,
    token: data.session.access_token,
    userId: data.session.user.id,
  };
}

function writeRequest(
  url: string,
  token: string,
  clientIp: string,
  body: unknown,
) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'cf-connecting-ip': clientIp,
      'x-turnstile-token': TURNSTILE_TEST_TOKEN,
    },
    body: JSON.stringify(body),
  });
}

function expectNoKnownUserIds(body: string, actors: Array<{ userId: string }>) {
  for (const actor of actors) {
    expect(body).not.toContain(actor.userId);
  }
}

function oneUtcYearAfter(value: Date) {
  const targetYear = value.getUTCFullYear() + 1;
  const month = value.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      month,
      Math.min(value.getUTCDate(), lastDay),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );
}

describe('community retention calendar boundary', () => {
  it('matches PostgreSQL calendar-year addition', () => {
    expect(oneUtcYearAfter(new Date('2024-02-29T12:34:56.789Z'))).toEqual(
      new Date('2025-02-28T12:34:56.789Z'),
    );
    expect(oneUtcYearAfter(new Date('2026-09-04T12:34:56.789Z'))).toEqual(
      new Date('2027-09-04T12:34:56.789Z'),
    );
  });
});

describe.runIf(runIntegration)('local community security integration', () => {
  let env: LocalEnvironment;
  let service: SupabaseClient;
  let actors: Awaited<ReturnType<typeof anonymousSession>>[];
  let adminToken: string;
  let adminUserId: string;
  let nonAdminToken: string;

  beforeAll(async () => {
    env = localEnvironment();
    process.env.NEXT_PUBLIC_COMMUNITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = env.PUBLISHABLE_KEY;
    process.env.SUPABASE_SECRET_KEY = env.SECRET_KEY;
    process.env.TURNSTILE_SECRET_KEY = TURNSTILE_TEST_SECRET;
    process.env.COMMUNITY_HMAC_SECRET =
      'integration-hmac-secret-at-least-32-characters';
    process.env.COMMUNITY_TRUSTED_PROXY_MODE = 'local';
    service = createClient(env.API_URL, env.SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const password = `Test-${randomUUID()}-Aa1!`;
    const adminEmail = `admin-${randomUUID()}@example.invalid`;
    const adminUser = await service.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
    });
    expect(adminUser.error).toBeNull();
    if (!adminUser.data.user)
      throw new Error('local admin user creation failed');
    adminUserId = adminUser.data.user.id;
    const membership = await service
      .from('community_admins')
      .insert({ user_id: adminUserId });
    expect(membership.error).toBeNull();

    const nonAdminEmail = `non-admin-${randomUUID()}@example.invalid`;
    const nonAdminUser = await service.auth.admin.createUser({
      email: nonAdminEmail,
      password,
      email_confirm: true,
    });
    expect(nonAdminUser.error).toBeNull();
    const permanentClient = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [adminLogin, nonAdminLogin] = await Promise.all([
      permanentClient.auth.signInWithPassword({ email: adminEmail, password }),
      createClient(env.API_URL, env.PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).auth.signInWithPassword({ email: nonAdminEmail, password }),
    ]);
    expect(adminLogin.error).toBeNull();
    expect(nonAdminLogin.error).toBeNull();
    if (!adminLogin.data.session || !nonAdminLogin.data.session) {
      throw new Error('local permanent auth failed');
    }
    adminToken = adminLogin.data.session.access_token;
    nonAdminToken = nonAdminLogin.data.session.access_token;
    actors = await Promise.all(
      Array.from({ length: 11 }, () =>
        anonymousSession(env.API_URL, env.PUBLISHABLE_KEY),
      ),
    );
  }, 60_000);

  it('installs an active minute retention job and exposes service-only health', async () => {
    const health = await service.rpc('get_community_retention_health');
    const anonymousHealth = await actors[0].client.rpc(
      'get_community_retention_health',
    );

    expect(health.error).toBeNull();
    expect(health.data).toMatchObject({
      jobName: 'community-retention-every-minute',
      schedule: '* * * * *',
      active: true,
    });
    expect(health.data).not.toHaveProperty('command');
    expect(anonymousHealth.error).not.toBeNull();
    expect(anonymousHealth.data).toBeNull();
  });

  it('rejects anonymous and unregistered users from every admin read API while allowing the configured admin', async () => {
    const handlers = [
      {
        url: 'http://localhost/api/admin/community/reports',
        handle: handleListModerationReportsRequest,
      },
      {
        url: 'http://localhost/api/admin/community/content?status=deleted',
        handle: handleAdminContentRequest,
      },
      {
        url: 'http://localhost/api/admin/community/sanctions?state=active',
        handle: handleAdminSanctionsRequest,
      },
      {
        url: 'http://localhost/api/admin/community/audit',
        handle: handleAdminAuditRequest,
      },
    ];

    for (const { url, handle } of handlers) {
      expect((await handle(new Request(url))).status).toBe(401);
      expect(
        (
          await handle(
            new Request(url, {
              headers: { authorization: `Bearer ${actors[0].token}` },
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await handle(
            new Request(url, {
              headers: { authorization: `Bearer ${nonAdminToken}` },
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await handle(
            new Request(url, {
              headers: { authorization: `Bearer ${adminToken}` },
            }),
          )
        ).status,
      ).toBe(200);
    }
  }, 60_000);

  it('enforces the full anonymous write, report, moderation and public-read boundary', async () => {
    const direct = await actors[0].client.from('community_posts').insert({
      author_id: actors[0].userId,
      author_name: '우회 작성자',
      title: '직접 쓰기 시도',
      body: '이 요청은 RLS와 grant에서 거부되어야 합니다.',
      idempotency_key: randomUUID(),
    });
    expect(direct.error).not.toBeNull();

    const missingHuman = await handleCreatePostRequest(
      new Request('http://localhost/api/community/posts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${actors[0].token}`,
          'cf-connecting-ip': '203.0.113.1',
        },
        body: JSON.stringify({
          title: '검증 없는 요청',
          body: 'Turnstile 없이는 작성할 수 없어야 합니다.',
          linkUrl: null,
          idempotencyKey: randomUUID(),
        }),
      }),
    );
    expect(missingHuman.status).toBe(403);

    const createResponse = await handleCreatePostRequest(
      writeRequest(
        'http://localhost/api/community/posts',
        actors[0].token,
        '203.0.113.1',
        {
          title: '통합 보안 검증 게시글',
          body: 'JWT와 Turnstile을 통과한 application API 요청입니다.',
          linkUrl: null,
          idempotencyKey: randomUUID(),
        },
      ),
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { id: string };
    expect(JSON.stringify(created)).not.toMatch(
      /author_id|reporter_id|abuse_key|raw ip|secret/i,
    );

    const foreignDelete = await handleDeletePostRequest(
      new Request(`http://localhost/api/community/posts/${created.id}`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${actors[1].token}`,
          'cf-connecting-ip': '203.0.113.2',
          'x-turnstile-token': TURNSTILE_TEST_TOKEN,
        },
      }),
      created.id,
    );
    expect(foreignDelete.status).toBe(403);

    for (let index = 1; index <= 10; index += 1) {
      const response = await handleReportRequest(
        writeRequest(
          'http://localhost/api/community/reports',
          actors[index].token,
          `203.0.113.${index + 1}`,
          {
            targetType: 'post',
            targetId: created.id,
            reason: 'spam',
            detail: '통합 테스트 일반 신고',
          },
        ),
      );
      expect(response.status).toBe(201);
      const result = (await response.json()) as { temporarilyHidden: boolean };
      expect(result.temporarilyHidden).toBe(index === 10);
    }

    const duplicate = await handleReportRequest(
      writeRequest(
        'http://localhost/api/community/reports',
        actors[1].token,
        '203.0.113.2',
        {
          targetType: 'post',
          targetId: created.id,
          reason: 'spam',
          detail: '중복 신고 시도',
        },
      ),
    );
    expect(duplicate.status).toBe(409);

    const sameNetworkPostResponse = await handleCreatePostRequest(
      writeRequest(
        'http://localhost/api/community/posts',
        actors[0].token,
        '203.0.113.1',
        {
          title: '동일 네트워크 신고 검증',
          body: '서로 다른 계정이어도 같은 abuse key만으로 숨김 기준을 채울 수 없습니다.',
          linkUrl: null,
          idempotencyKey: randomUUID(),
        },
      ),
    );
    expect(sameNetworkPostResponse.status).toBe(201);
    const sameNetworkPost = (await sameNetworkPostResponse.json()) as {
      id: string;
    };
    for (let index = 1; index <= 10; index += 1) {
      const response = await handleReportRequest(
        writeRequest(
          'http://localhost/api/community/reports',
          actors[index].token,
          '198.51.100.20',
          {
            targetType: 'post',
            targetId: sameNetworkPost.id,
            reason: 'spam',
            detail: '동일 네트워크 일반 신고',
          },
        ),
      );
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({
        temporarilyHidden: false,
      });
    }

    const privacyReport = await handleReportRequest(
      writeRequest(
        'http://localhost/api/community/reports',
        actors[0].token,
        '203.0.113.1',
        {
          targetType: 'post',
          targetId: sameNetworkPost.id,
          reason: 'privacy',
          detail: '개인정보 노출 긴급 신고',
        },
      ),
    );
    expect(privacyReport.status).toBe(201);
    await expect(privacyReport.json()).resolves.toMatchObject({
      temporarilyHidden: true,
    });

    const publicList = await handleListPostsRequest(
      new Request('http://localhost/api/community/posts'),
    );
    expect(publicList.status).toBe(200);
    const publicText = await publicList.text();
    expect(publicText).not.toContain(created.id);
    expect(publicText).not.toMatch(
      /author_id|reporter_id|abuse_key|raw ip|secret/i,
    );

    const password = `Test-${randomUUID()}-Aa1!`;
    const email = `non-admin-${randomUUID()}@example.invalid`;
    const createdUser = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createdUser.error).toBeNull();
    const permanentClient = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await permanentClient.auth.signInWithPassword({
      email,
      password,
    });
    expect(login.error).toBeNull();
    const nonAdminResponse = await handleModerationActionRequest(
      new Request('http://localhost/api/admin/community/actions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${login.data.session?.access_token}`,
        },
        body: JSON.stringify({
          type: 'restore',
          targetType: 'post',
          targetId: created.id,
          reason: '권한 없는 복구 시도',
        }),
      }),
    );
    expect(nonAdminResponse.status).toBe(403);
  }, 60_000);

  it('keeps author and admin deletion recoverable, hides raw identities, and audits restriction changes', async () => {
    const createResponse = await handleCreatePostRequest(
      writeRequest(
        'http://localhost/api/community/posts',
        actors[0].token,
        '192.0.2.10',
        {
          title: '관리자 복구 통합 검증 게시글',
          body: '작성자 삭제와 관리자 복구를 실제 local API로 검증합니다.',
          linkUrl: null,
          idempotencyKey: randomUUID(),
        },
      ),
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { id: string };

    const reportResponse = await handleReportRequest(
      writeRequest(
        'http://localhost/api/community/reports',
        actors[1].token,
        '192.0.2.11',
        {
          targetType: 'post',
          targetId: created.id,
          reason: 'spam',
          detail: '신고자 비공개 통합 검증',
        },
      ),
    );
    expect(reportResponse.status).toBe(201);

    const reportsResponse = await handleListModerationReportsRequest(
      new Request('http://localhost/api/admin/community/reports', {
        headers: { authorization: `Bearer ${adminToken}` },
      }),
    );
    expect(reportsResponse.status).toBe(200);
    const reportsText = await reportsResponse.text();
    expectNoKnownUserIds(reportsText, actors);
    expect(reportsText).not.toMatch(/reporter_id|author_id|abuse_key|secret/i);

    const deleteResponse = await handleDeletePostRequest(
      new Request(`http://localhost/api/community/posts/${created.id}`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${actors[0].token}`,
          'cf-connecting-ip': '192.0.2.10',
          'x-turnstile-token': TURNSTILE_TEST_TOKEN,
        },
      }),
      created.id,
    );
    expect(deleteResponse.status).toBe(204);
    expect(
      (
        await handleGetPostRequest(
          new Request(`http://localhost/api/community/posts/${created.id}`),
          created.id,
        )
      ).status,
    ).toBe(404);

    const authorTrashResponse = await handleAdminContentRequest(
      new Request(
        'http://localhost/api/admin/community/content?status=deleted',
        {
          headers: { authorization: `Bearer ${adminToken}` },
        },
      ),
    );
    expect(authorTrashResponse.status).toBe(200);
    const authorTrash = (await authorTrashResponse.json()) as {
      items: Array<{
        targetId: string;
        deletionSource: string;
        purgeAt: string | null;
      }>;
    };
    expect(authorTrash.items).toContainEqual(
      expect.objectContaining({
        targetId: created.id,
        deletionSource: 'author',
        purgeAt: expect.any(String),
      }),
    );
    const authorTrashText = JSON.stringify(authorTrash);
    expectNoKnownUserIds(authorTrashText, actors);
    expect(authorTrashText).not.toMatch(/author_id|abuse_key|secret/i);

    const restore = (reason: string) =>
      handleModerationActionRequest(
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
            reason,
          }),
        }),
      );
    expect((await restore('작성자 삭제 복구 통합 검증')).status).toBe(204);
    expect(
      (
        await handleGetPostRequest(
          new Request(`http://localhost/api/community/posts/${created.id}`),
          created.id,
        )
      ).status,
    ).toBe(200);

    const adminDelete = await handleModerationActionRequest(
      new Request('http://localhost/api/admin/community/actions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          type: 'delete',
          targetType: 'post',
          targetId: created.id,
          reason: '관리자 삭제 주체 통합 검증',
        }),
      }),
    );
    expect(adminDelete.status).toBe(204);
    const adminTrashResponse = await handleAdminContentRequest(
      new Request(
        'http://localhost/api/admin/community/content?status=deleted',
        {
          headers: { authorization: `Bearer ${adminToken}` },
        },
      ),
    );
    const adminTrash = (await adminTrashResponse.json()) as {
      items: Array<{ targetId: string; deletionSource: string }>;
    };
    expect(adminTrashResponse.status).toBe(200);
    expect(adminTrash.items).toContainEqual(
      expect.objectContaining({
        targetId: created.id,
        deletionSource: 'admin',
      }),
    );
    expectNoKnownUserIds(JSON.stringify(adminTrash), actors);
    expect((await restore('관리자 삭제 복구 통합 검증')).status).toBe(204);

    const restrictionReportResponse = await handleReportRequest(
      writeRequest(
        'http://localhost/api/community/reports',
        actors[3].token,
        '192.0.2.13',
        {
          targetType: 'post',
          targetId: created.id,
          reason: 'harassment',
          detail: '제재 원자성 통합 검증',
        },
      ),
    );
    expect(restrictionReportResponse.status).toBe(201);
    const restrictionQueueResponse = await handleListModerationReportsRequest(
      new Request('http://localhost/api/admin/community/reports', {
        headers: { authorization: `Bearer ${adminToken}` },
      }),
    );
    const restrictionQueue = (await restrictionQueueResponse.json()) as {
      items: Array<{ id: string; targetId: string }>;
    };
    const restrictionReport = restrictionQueue.items.find(
      (item) => item.targetId === created.id,
    );
    expect(restrictionReport).toBeDefined();

    const restrictResponse = await handleModerationActionRequest(
      new Request('http://localhost/api/admin/community/actions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          type: 'restrict',
          reportId: restrictionReport?.id,
          targetType: 'post',
          targetId: created.id,
          until: new Date(Date.now() + 86_400_000).toISOString(),
          reason: '제재와 해제 감사 통합 검증',
        }),
      }),
    );
    expect(restrictResponse.status).toBe(204);
    const sanctionsResponse = await handleAdminSanctionsRequest(
      new Request(
        'http://localhost/api/admin/community/sanctions?state=active',
        {
          headers: { authorization: `Bearer ${adminToken}` },
        },
      ),
    );
    expect(sanctionsResponse.status).toBe(200);
    const sanctions = (await sanctionsResponse.json()) as {
      items: Array<{ sanctionId: string; reason: string }>;
    };
    const sanction = sanctions.items.find(
      (item) => item.reason === '제재와 해제 감사 통합 검증',
    );
    expect(sanction).toBeDefined();
    expectNoKnownUserIds(JSON.stringify(sanctions), actors);

    const unrestrictResponse = await handleModerationActionRequest(
      new Request('http://localhost/api/admin/community/actions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          type: 'unrestrict',
          sanctionId: sanction?.sanctionId,
          reason: '제재 해제 감사 통합 검증',
        }),
      }),
    );
    expect(unrestrictResponse.status).toBe(204);
    const auditResponse = await handleAdminAuditRequest(
      new Request(
        'http://localhost/api/admin/community/audit?action=unrestrict',
        {
          headers: { authorization: `Bearer ${adminToken}` },
        },
      ),
    );
    expect(auditResponse.status).toBe(200);
    const auditText = await auditResponse.text();
    expect(auditText).toContain('제재 해제 감사 통합 검증');
    expectNoKnownUserIds(auditText, actors);
    expect(auditText).not.toMatch(
      /admin_id|author_id|user_id|abuse_key|secret/i,
    );
  }, 60_000);

  it('dismisses a visible report without changing content and audits the closure', async () => {
    const createResponse = await handleCreatePostRequest(
      writeRequest(
        'http://localhost/api/community/posts',
        actors[4].token,
        '192.0.2.14',
        {
          title: '신고 기각 통합 검증 게시글',
          body: '비징계 신고 종결 뒤에도 공개 상태를 유지합니다.',
          linkUrl: null,
          idempotencyKey: randomUUID(),
        },
      ),
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { id: string };
    expect(
      (
        await handleReportRequest(
          writeRequest(
            'http://localhost/api/community/reports',
            actors[5].token,
            '192.0.2.15',
            {
              targetType: 'post',
              targetId: created.id,
              reason: 'other',
              detail: '기각 경로 통합 검증',
            },
          ),
        )
      ).status,
    ).toBe(201);

    const queueResponse = await handleListModerationReportsRequest(
      new Request('http://localhost/api/admin/community/reports', {
        headers: { authorization: `Bearer ${adminToken}` },
      }),
    );
    const queue = (await queueResponse.json()) as {
      items: Array<{ id: string; targetId: string }>;
    };
    const report = queue.items.find((item) => item.targetId === created.id);
    expect(report).toBeDefined();

    const dismissResponse = await handleModerationActionRequest(
      new Request('http://localhost/api/admin/community/actions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          type: 'dismiss',
          reportId: report?.id,
          targetType: 'post',
          targetId: created.id,
          reason: '운영정책 위반 근거가 확인되지 않음',
        }),
      }),
    );
    expect(dismissResponse.status).toBe(204);
    expect(
      (
        await handleGetPostRequest(
          new Request(`http://localhost/api/community/posts/${created.id}`),
          created.id,
        )
      ).status,
    ).toBe(200);

    const auditResponse = await handleAdminAuditRequest(
      new Request(
        'http://localhost/api/admin/community/audit?action=dismiss&targetType=post',
        { headers: { authorization: `Bearer ${adminToken}` } },
      ),
    );
    expect(auditResponse.status).toBe(200);
    const auditText = await auditResponse.text();
    expect(auditText).toContain('운영정책 위반 근거가 확인되지 않음');
    expectNoKnownUserIds(auditText, actors);
  }, 60_000);

  it('preserves expired deleted content under legal hold and purges it after the hold ends', async () => {
    const createResponse = await handleCreatePostRequest(
      writeRequest(
        'http://localhost/api/community/posts',
        actors[2].token,
        '192.0.2.12',
        {
          title: 'Legal hold retention 통합 검증',
          body: '1년 파기와 legal hold 예외를 실제 retention RPC로 검증합니다.',
          linkUrl: null,
          idempotencyKey: randomUUID(),
        },
      ),
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { id: string };
    const deleteStartedAt = Date.now();
    const deleteResponse = await handleModerationActionRequest(
      new Request('http://localhost/api/admin/community/actions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          type: 'delete',
          targetType: 'post',
          targetId: created.id,
          reason: '관리자 삭제 retention 통합 검증',
        }),
      }),
    );
    const deleteFinishedAt = Date.now();
    expect(deleteResponse.status).toBe(204);

    const adminDeletionMetadata = await service
      .from('community_posts')
      .select('deletion_source,deleted_at,purge_at')
      .eq('id', created.id)
      .single();
    expect(adminDeletionMetadata.error).toBeNull();
    expect(adminDeletionMetadata.data?.deletion_source).toBe('admin');
    const deletedAt = new Date(adminDeletionMetadata.data?.deleted_at ?? '');
    const purgeAt = new Date(adminDeletionMetadata.data?.purge_at ?? '');
    expect(Number.isNaN(deletedAt.getTime())).toBe(false);
    expect(Number.isNaN(purgeAt.getTime())).toBe(false);
    expect(deletedAt.getTime()).toBeGreaterThanOrEqual(deleteStartedAt - 1_000);
    expect(deletedAt.getTime()).toBeLessThanOrEqual(deleteFinishedAt + 1_000);
    expect(
      Math.abs(purgeAt.getTime() - oneUtcYearAfter(deletedAt).getTime()),
    ).toBeLessThanOrEqual(1_000);

    const hold = await service.from('community_legal_holds').insert({
      subject_type: 'post',
      subject_id: created.id,
      reason: '통합 테스트 진행 중인 분쟁 보존',
      created_by: adminUserId,
    });
    expect(hold.error).toBeNull();
    const retentionAt = new Date(purgeAt.getTime() + 1_000);
    const firstRetention = await service.rpc('run_community_retention', {
      p_now: retentionAt.toISOString(),
    });
    expect(firstRetention.error).toBeNull();
    expect(
      (
        await service
          .from('community_posts')
          .select('id')
          .eq('id', created.id)
          .maybeSingle()
      ).data?.id,
    ).toBe(created.id);

    const releaseHold = await service
      .from('community_legal_holds')
      .update({ released_at: retentionAt.toISOString() })
      .eq('subject_type', 'post')
      .eq('subject_id', created.id);
    expect(releaseHold.error).toBeNull();
    const secondRetention = await service.rpc('run_community_retention', {
      p_now: new Date(retentionAt.getTime() + 1_000).toISOString(),
    });
    expect(secondRetention.error).toBeNull();
    expect(
      (
        await service
          .from('community_posts')
          .select('id')
          .eq('id', created.id)
          .maybeSingle()
      ).data,
    ).toBeNull();
  }, 60_000);
});
