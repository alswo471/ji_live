import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CommunityModerationError,
  listModerationQueue,
  moderateContent,
  moderationRepository,
  type ModerationRepository,
  type ModerationReportRecord,
} from '@/lib/community/moderation-service';

const { getServerSupabaseMock } = vi.hoisted(() => ({
  getServerSupabaseMock: vi.fn(),
}));

vi.mock('@/lib/community/supabase', () => ({
  getServerSupabase: getServerSupabaseMock,
}));

const ADMIN = { id: '10000000-0000-4000-8000-000000000001' };
const POST_ID = '20000000-0000-4000-8000-000000000001';
const AUTHOR_ID = '30000000-0000-4000-8000-000000000001';
const SANCTION_ID = '50000000-0000-4000-8000-000000000001';
const SECRET = 'test-secret-at-least-32-characters';

afterEach(() => {
  getServerSupabaseMock.mockReset();
});

function report(
  overrides: Partial<ModerationReportRecord> = {},
): ModerationReportRecord {
  return {
    id: '40000000-0000-4000-8000-000000000001',
    targetType: 'post',
    targetId: POST_ID,
    targetAuthorId: AUTHOR_ID,
    targetTitle: '시장 질문',
    targetBody: '검토가 필요한 게시글입니다.',
    targetStatus: 'hidden',
    reason: 'spam',
    detail: '반복 광고입니다.',
    createdAt: '2026-09-03T04:00:00.000Z',
    ...overrides,
  };
}

function repository(
  overrides: Partial<ModerationRepository> = {},
): ModerationRepository {
  return {
    findOpenReports: async () => [],
    applyAction: async () => undefined,
    ...overrides,
  };
}

describe('listModerationQueue', () => {
  it('returns open reports without reporter identity', async () => {
    const page = await listModerationQueue(
      null,
      repository({ findOpenReports: async () => [report()] }),
      SECRET,
    );

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      targetType: 'post',
      targetId: POST_ID,
      actorLabel: expect.stringMatching(/^익명 사용자 #[A-F0-9]{4}$/),
      reason: 'spam',
    });
    expect(page.items[0]).not.toHaveProperty('targetAuthorId');
    expect(page.items[0]).not.toHaveProperty('reporterId');
    expect(page.items[0]).not.toHaveProperty('reporterAbuseKey');
    expect(JSON.stringify(page)).not.toContain(AUTHOR_ID);
  });
});

describe('moderationRepository', () => {
  it('resolves the target author immediately before the restriction RPC', async () => {
    const events: string[] = [];
    const rpcCalls: Array<{ name: string; parameters: unknown }> = [];
    const lookup = {
      select: (columns: string) => {
        events.push(`select:${columns}`);
        return lookup;
      },
      eq: (column: string, value: string) => {
        events.push(`eq:${column}:${value}`);
        return lookup;
      },
      maybeSingle: async () => {
        events.push('maybeSingle');
        return { data: { author_id: AUTHOR_ID }, error: null };
      },
    };
    getServerSupabaseMock.mockReturnValue({
      from: (table: string) => {
        events.push(`from:${table}`);
        return lookup;
      },
      rpc: async (name: string, parameters: unknown) => {
        events.push(`rpc:${name}`);
        rpcCalls.push({ name, parameters });
        return { error: null };
      },
    });

    await moderationRepository.applyAction(ADMIN.id, {
      type: 'restrict',
      targetType: 'post',
      targetId: POST_ID,
      until: '2026-09-11T04:00:00.000Z',
      reason: '반복적인 운영정책 위반',
    });

    expect(events).toEqual([
      'from:community_posts',
      'select:author_id',
      `eq:id:${POST_ID}`,
      'maybeSingle',
      'rpc:moderate_community_content',
    ]);
    expect(rpcCalls).toEqual([
      {
        name: 'moderate_community_content',
        parameters: {
          p_admin_id: ADMIN.id,
          p_action: 'restrict',
          p_target_type: 'user',
          p_target_id: null,
          p_user_id: AUTHOR_ID,
          p_until: '2026-09-11T04:00:00.000Z',
          p_reason: '반복적인 운영정책 위반',
        },
      },
    ]);
  });

  it('calls the sanction revocation RPC with only its preserved parameters', async () => {
    const rpcCalls: Array<{ name: string; parameters: unknown }> = [];
    getServerSupabaseMock.mockReturnValue({
      from: () => {
        throw new Error('unrestrict must not query a content author');
      },
      rpc: async (name: string, parameters: unknown) => {
        rpcCalls.push({ name, parameters });
        return { error: null };
      },
    });

    await moderationRepository.applyAction(ADMIN.id, {
      type: 'unrestrict',
      sanctionId: SANCTION_ID,
      reason: '제재 사유를 다시 검토함',
    });

    expect(rpcCalls).toEqual([
      {
        name: 'revoke_community_sanction',
        parameters: {
          p_admin_id: ADMIN.id,
          p_sanction_id: SANCTION_ID,
          p_reason: '제재 사유를 다시 검토함',
        },
      },
    ]);
  });
});

describe('moderateContent', () => {
  it('trims and applies a valid content action with the verified admin', async () => {
    let received: unknown;
    const repo = repository({
      applyAction: async (adminId, action) => {
        received = { adminId, action };
      },
    });

    await moderateContent(
      ADMIN,
      {
        type: 'hide',
        targetType: 'post',
        targetId: POST_ID,
        reason: '  반복 광고로 숨김 처리  ',
      },
      repo,
    );

    expect(received).toEqual({
      adminId: ADMIN.id,
      action: {
        type: 'hide',
        targetType: 'post',
        targetId: POST_ID,
        reason: '반복 광고로 숨김 처리',
      },
    });
  });

  it('rejects a restriction that has already expired', async () => {
    await expect(
      moderateContent(
        ADMIN,
        {
          type: 'restrict',
          targetType: 'post',
          targetId: POST_ID,
          until: '2026-09-03T03:59:59.000Z',
          reason: '반복적인 운영정책 위반',
        },
        repository(),
        new Date('2026-09-03T04:00:00.000Z'),
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_restriction_until',
    });
  });

  it('requests a restriction by content target without a browser user UUID', async () => {
    let received: unknown;
    const repo = repository({
      applyAction: async (adminId, action) => {
        received = { adminId, action };
      },
    });

    await moderateContent(
      ADMIN,
      {
        type: 'restrict',
        targetType: 'post',
        targetId: POST_ID,
        until: '2026-09-11T04:00:00.000Z',
        reason: ' 반복적인 운영정책 위반 ',
      },
      repo,
      new Date('2026-09-03T04:00:00.000Z'),
    );

    expect(received).toEqual({
      adminId: ADMIN.id,
      action: {
        type: 'restrict',
        targetType: 'post',
        targetId: POST_ID,
        until: '2026-09-11T04:00:00.000Z',
        reason: '반복적인 운영정책 위반',
      },
    });
    expect(JSON.stringify(received)).not.toContain(AUTHOR_ID);
  });

  it('rejects a browser-supplied user UUID before repository access', async () => {
    const repo = repository({
      applyAction: async () => {
        throw new Error('a raw browser user UUID must not reach repository');
      },
    });

    await expect(
      moderateContent(
        ADMIN,
        {
          type: 'restrict',
          targetType: 'post',
          targetId: POST_ID,
          userId: AUTHOR_ID,
          until: '2026-09-11T04:00:00.000Z',
          reason: '반복적인 운영정책 위반',
        },
        repo,
        new Date('2026-09-03T04:00:00.000Z'),
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_moderation_action',
    });
  });

  it('applies an unrestrict action by sanction ID', async () => {
    let received: unknown;
    const repo = repository({
      applyAction: async (adminId, action) => {
        received = { adminId, action };
      },
    });

    await moderateContent(
      ADMIN,
      {
        type: 'unrestrict',
        sanctionId: SANCTION_ID,
        reason: '제재 사유를 다시 검토함',
      },
      repo,
    );

    expect(received).toEqual({
      adminId: ADMIN.id,
      action: {
        type: 'unrestrict',
        sanctionId: SANCTION_ID,
        reason: '제재 사유를 다시 검토함',
      },
    });
  });

  it('rejects an unknown action and a short reason before repository access', async () => {
    const repo = repository({
      applyAction: async () => {
        throw new Error('invalid input must not reach repository');
      },
    });

    await expect(
      moderateContent(
        ADMIN,
        {
          type: 'delete',
          targetType: 'post',
          targetId: POST_ID,
          reason: '짧음',
        },
        repo,
      ),
    ).rejects.toBeInstanceOf(CommunityModerationError);

    await expect(
      moderateContent(ADMIN, { type: 'ban' }, repo),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_moderation_action' });
  });
});
