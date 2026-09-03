import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleModerationActionRequest } from '@/app/api/admin/community/actions/route';
import {
  handleCreatePostRequest,
  handleListPostsRequest,
} from '@/app/api/community/posts/route';
import { handleDeletePostRequest } from '@/app/api/community/posts/[id]/route';
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

describe.runIf(runIntegration)('local community security integration', () => {
  let env: LocalEnvironment;
  let service: SupabaseClient;
  let actors: Awaited<ReturnType<typeof anonymousSession>>[];

  beforeAll(async () => {
    env = localEnvironment();
    process.env.NEXT_PUBLIC_COMMUNITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = env.PUBLISHABLE_KEY;
    process.env.SUPABASE_SECRET_KEY = env.SECRET_KEY;
    process.env.TURNSTILE_SECRET_KEY = TURNSTILE_TEST_SECRET;
    process.env.COMMUNITY_HMAC_SECRET =
      'integration-hmac-secret-at-least-32-characters';
    service = createClient(env.API_URL, env.SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    actors = await Promise.all(
      Array.from({ length: 11 }, () =>
        anonymousSession(env.API_URL, env.PUBLISHABLE_KEY),
      ),
    );
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
        headers: { authorization: `Bearer ${actors[1].token}` },
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
});
