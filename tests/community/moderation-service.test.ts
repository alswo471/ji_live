import { describe, expect, it } from 'vitest';
import {
  CommunityModerationError,
  listModerationQueue,
  moderateContent,
  type ModerationRepository,
  type ModerationReportRecord,
} from '@/lib/community/moderation-service';

const ADMIN = { id: '10000000-0000-4000-8000-000000000001' };
const POST_ID = '20000000-0000-4000-8000-000000000001';
const AUTHOR_ID = '30000000-0000-4000-8000-000000000001';

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
    );

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      targetType: 'post',
      targetId: POST_ID,
      targetAuthorId: AUTHOR_ID,
      reason: 'spam',
    });
    expect(page.items[0]).not.toHaveProperty('reporterId');
    expect(page.items[0]).not.toHaveProperty('reporterAbuseKey');
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
          userId: AUTHOR_ID,
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
