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
const REPORT_ID = '40000000-0000-4000-8000-000000000001';
const SANCTION_ID = '50000000-0000-4000-8000-000000000001';
const SECRET = 'test-secret-at-least-32-characters';

afterEach(() => {
  getServerSupabaseMock.mockReset();
});

function report(
  overrides: Partial<ModerationReportRecord> = {},
): ModerationReportRecord {
  return {
    id: REPORT_ID,
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
  it('lets the atomic RPC resolve a report target before restricting its author', async () => {
    const rpcCalls: Array<{ name: string; parameters: unknown }> = [];
    getServerSupabaseMock.mockReturnValue({
      from: () => {
        throw new Error('restriction must be resolved atomically in the RPC');
      },
      rpc: async (name: string, parameters: unknown) => {
        rpcCalls.push({ name, parameters });
        return { error: null };
      },
    });

    await moderationRepository.applyAction(ADMIN.id, {
      type: 'restrict',
      reportId: REPORT_ID,
      targetType: 'post',
      targetId: POST_ID,
      until: '2026-09-11T04:00:00.000Z',
      reason: '반복적인 운영정책 위반',
    });

    expect(rpcCalls).toEqual([
      {
        name: 'moderate_community_content',
        parameters: {
          p_admin_id: ADMIN.id,
          p_action: 'restrict',
          p_target_type: 'post',
          p_target_id: POST_ID,
          p_user_id: null,
          p_until: '2026-09-11T04:00:00.000Z',
          p_reason: '반복적인 운영정책 위반',
          p_report_id: REPORT_ID,
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

  it('maps a persistence state conflict to a safe 409 without provider detail', async () => {
    const providerDetail = 'community moderation state conflict';
    getServerSupabaseMock.mockReturnValue({
      rpc: async () => ({ error: { code: 'P0001', message: providerDetail } }),
    });

    await expect(
      moderationRepository.applyAction(ADMIN.id, {
        type: 'restore',
        targetType: 'post',
        targetId: POST_ID,
        reason: '이미 공개된 콘텐츠 복구 시도',
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'moderation_state_conflict',
      message: '현재 상태에서는 이 관리 조치를 적용할 수 없습니다.',
    });
  });

  it('preserves a missing persistence target as a safe 404', async () => {
    getServerSupabaseMock.mockReturnValue({
      rpc: async () => ({ error: { code: 'P0002' } }),
    });

    await expect(
      moderationRepository.applyAction(ADMIN.id, {
        type: 'hide',
        reportId: REPORT_ID,
        targetType: 'post',
        targetId: POST_ID,
        reason: '파기된 콘텐츠 숨김 시도',
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: 'moderation_target_not_found',
    });
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
        reportId: REPORT_ID,
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
        reportId: REPORT_ID,
        targetType: 'post',
        targetId: POST_ID,
        reason: '반복 광고로 숨김 처리',
      },
    });
  });

  it('normalizes a non-punitive report dismissal', async () => {
    let received: unknown;
    const repo = repository({
      applyAction: async (adminId, action) => {
        received = { adminId, action };
      },
    });

    await moderateContent(
      ADMIN,
      {
        type: 'dismiss',
        reportId: REPORT_ID.toUpperCase(),
        targetType: 'post',
        targetId: POST_ID,
        reason: '신고 대상이 운영정책을 위반하지 않음',
      },
      repo,
    );

    expect(received).toEqual({
      adminId: ADMIN.id,
      action: {
        type: 'dismiss',
        reportId: REPORT_ID,
        targetType: 'post',
        targetId: POST_ID,
        reason: '신고 대상이 운영정책을 위반하지 않음',
      },
    });
  });

  it('rejects a restriction that has already expired', async () => {
    await expect(
      moderateContent(
        ADMIN,
        {
          type: 'restrict',
          reportId: REPORT_ID,
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
        reportId: REPORT_ID,
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
        reportId: REPORT_ID,
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
          reportId: REPORT_ID,
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

  it('requires a report ID for report dismissal and restriction', async () => {
    const repo = repository({
      applyAction: async () => {
        throw new Error('invalid report action must not reach repository');
      },
    });

    for (const input of [
      {
        type: 'dismiss',
        targetType: 'post',
        targetId: POST_ID,
        reason: '근거가 없어 신고를 종결함',
      },
      {
        type: 'restrict',
        targetType: 'post',
        targetId: POST_ID,
        until: '2026-09-11T04:00:00.000Z',
        reason: '반복적인 운영정책 위반',
      },
    ]) {
      await expect(
        moderateContent(
          ADMIN,
          input,
          repo,
          new Date('2026-09-03T04:00:00.000Z'),
        ),
      ).rejects.toMatchObject({ status: 400, code: 'invalid_report_id' });
    }
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
