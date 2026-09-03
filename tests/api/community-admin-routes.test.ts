import { describe, expect, it } from 'vitest';
import {
  handleListModerationReportsRequest,
  type CommunityAdminReportsDependencies,
} from '@/app/api/admin/community/reports/route';
import {
  handleModerationActionRequest,
  type CommunityAdminActionsDependencies,
} from '@/app/api/admin/community/actions/route';
import { CommunityAdminAuthError } from '@/lib/community/admin-auth';
import { CommunityModerationError } from '@/lib/community/moderation-service';
import { CommunityReadInputError } from '@/lib/community/read-service';

const ADMIN = { id: '10000000-0000-4000-8000-000000000001' };

function reportsDependencies(
  overrides: Partial<CommunityAdminReportsDependencies> = {},
): CommunityAdminReportsDependencies {
  return {
    enabled: () => true,
    requireAdmin: async () => ADMIN,
    listQueue: async () => ({ items: [], nextCursor: null }),
    ...overrides,
  };
}

function actionsDependencies(
  overrides: Partial<CommunityAdminActionsDependencies> = {},
): CommunityAdminActionsDependencies {
  return {
    enabled: () => true,
    requireAdmin: async () => ADMIN,
    moderate: async () => undefined,
    ...overrides,
  };
}

describe('community admin routes', () => {
  it.each([
    [401, 'admin_auth_required'],
    [403, 'admin_access_denied'],
  ] as const)(
    'returns a safe %s for rejected admin auth',
    async (status, code) => {
      const response = await handleListModerationReportsRequest(
        new Request('http://localhost/api/admin/community/reports'),
        reportsDependencies({
          requireAdmin: async () => {
            throw new CommunityAdminAuthError(
              status,
              code,
              '관리자 권한이 필요합니다.',
            );
          },
        }),
      );

      expect(response.status).toBe(status);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual({
        code,
        error: '관리자 권한이 필요합니다.',
      });
    },
  );

  it('does not load reports while community is disabled', async () => {
    const response = await handleListModerationReportsRequest(
      new Request('http://localhost/api/admin/community/reports'),
      reportsDependencies({
        enabled: () => false,
        requireAdmin: async () => {
          throw new Error('disabled route must not authenticate');
        },
      }),
    );

    expect(response.status).toBe(404);
  });

  it('returns an authenticated no-store moderation page', async () => {
    const response = await handleListModerationReportsRequest(
      new Request('http://localhost/api/admin/community/reports'),
      reportsDependencies(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('maps an invalid queue cursor to a safe 400', async () => {
    const response = await handleListModerationReportsRequest(
      new Request('http://localhost/api/admin/community/reports?cursor=broken'),
      reportsDependencies({
        listQueue: async () => {
          throw new CommunityReadInputError(
            'invalid_cursor',
            '잘못된 페이지 요청입니다.',
          );
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'invalid_cursor',
      error: '잘못된 페이지 요청입니다.',
    });
  });

  it('maps invalid moderation input to a safe 400 without provider detail', async () => {
    const providerDetail = 'private database query detail';
    const response = await handleModerationActionRequest(
      new Request('http://localhost/api/admin/community/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'delete' }),
      }),
      actionsDependencies({
        moderate: async () => {
          throw new CommunityModerationError(
            400,
            'invalid_moderation_action',
            '관리 조치 내용을 확인해 주세요.',
          );
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(providerDetail);
  });

  it('applies an action with only the verified admin identity', async () => {
    let adminId = '';
    const response = await handleModerationActionRequest(
      new Request('http://localhost/api/admin/community/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'hide',
          targetType: 'post',
          targetId: '20000000-0000-4000-8000-000000000001',
          reason: '반복 광고로 숨김 처리',
          adminId: 'untrusted-admin',
        }),
      }),
      actionsDependencies({
        moderate: async (admin) => {
          adminId = admin.id;
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(adminId).toBe(ADMIN.id);
  });
});
