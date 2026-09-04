import { describe, expect, it, vi } from 'vitest';
import {
  handleAdminAuditRequest,
  type CommunityAdminAuditDependencies,
} from '@/app/api/admin/community/audit/route';
import {
  handleAdminContentRequest,
  type CommunityAdminContentDependencies,
} from '@/app/api/admin/community/content/route';
import {
  handleAdminSanctionsRequest,
  type CommunityAdminSanctionsDependencies,
} from '@/app/api/admin/community/sanctions/route';
import {
  handleAdminSummaryRequest,
  type CommunityAdminSummaryDependencies,
} from '@/app/api/admin/community/summary/route';
import {
  handleListModerationReportsRequest,
  type CommunityAdminReportsDependencies,
} from '@/app/api/admin/community/reports/route';
import {
  handleModerationActionRequest,
  type CommunityAdminActionsDependencies,
} from '@/app/api/admin/community/actions/route';
import { CommunityAdminAuthError } from '@/lib/community/admin-auth';
import { CommunityAdminConsoleError } from '@/lib/community/admin-console-service';
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

function summaryDependencies(
  overrides: Partial<CommunityAdminSummaryDependencies> = {},
): CommunityAdminSummaryDependencies {
  return {
    enabled: () => true,
    requireAdmin: async () => ADMIN,
    loadSummary: async () => ({ reports: 0, hidden: 0, trash: 0, sanctions: 0 }),
    ...overrides,
  };
}

function contentDependencies(
  overrides: Partial<CommunityAdminContentDependencies> = {},
): CommunityAdminContentDependencies {
  return {
    enabled: () => true,
    requireAdmin: async () => ADMIN,
    listContent: async () => ({ items: [], nextCursor: null }),
    ...overrides,
  };
}

function sanctionsDependencies(
  overrides: Partial<CommunityAdminSanctionsDependencies> = {},
): CommunityAdminSanctionsDependencies {
  return {
    enabled: () => true,
    requireAdmin: async () => ADMIN,
    listSanctions: async () => ({ items: [], nextCursor: null }),
    ...overrides,
  };
}

function auditDependencies(
  overrides: Partial<CommunityAdminAuditDependencies> = {},
): CommunityAdminAuditDependencies {
  return {
    enabled: () => true,
    requireAdmin: async () => ADMIN,
    listAudit: async () => ({ items: [], nextCursor: null }),
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

  it('rejects anonymous content access without calling the loader', async () => {
    const listContent = vi.fn();
    const response = await handleAdminContentRequest(
      new Request('http://localhost/api/admin/community/content?status=deleted'),
      contentDependencies({
        requireAdmin: async () => {
          throw new CommunityAdminAuthError(
            401,
            'admin_auth_required',
            '관리자 권한이 필요합니다.',
          );
        },
        listContent,
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(listContent).not.toHaveBeenCalled();
  });

  it('rejects anonymous summary access without calling the loader', async () => {
    const loadSummary = vi.fn();
    const response = await handleAdminSummaryRequest(
      new Request('http://localhost/api/admin/community/summary'),
      summaryDependencies({
        requireAdmin: async () => {
          throw new CommunityAdminAuthError(
            401,
            'admin_auth_required',
            '관리자 권한이 필요합니다.',
          );
        },
        loadSummary,
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(loadSummary).not.toHaveBeenCalled();
  });

  it('rejects anonymous sanctions access without calling the loader', async () => {
    const listSanctions = vi.fn();
    const response = await handleAdminSanctionsRequest(
      new Request('http://localhost/api/admin/community/sanctions?state=active'),
      sanctionsDependencies({
        requireAdmin: async () => {
          throw new CommunityAdminAuthError(
            401,
            'admin_auth_required',
            '관리자 권한이 필요합니다.',
          );
        },
        listSanctions,
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(listSanctions).not.toHaveBeenCalled();
  });

  it('rejects anonymous audit access without calling the loader', async () => {
    const listAudit = vi.fn();
    const response = await handleAdminAuditRequest(
      new Request('http://localhost/api/admin/community/audit'),
      auditDependencies({
        requireAdmin: async () => {
          throw new CommunityAdminAuthError(
            401,
            'admin_auth_required',
            '관리자 권한이 필요합니다.',
          );
        },
        listAudit,
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(listAudit).not.toHaveBeenCalled();
  });

  it('does not authenticate disabled admin content access', async () => {
    const requireAdmin = vi.fn();
    const response = await handleAdminContentRequest(
      new Request('http://localhost/api/admin/community/content?status=hidden'),
      contentDependencies({ enabled: () => false, requireAdmin }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it('forwards only supported content query fields', async () => {
    let input: unknown;
    const response = await handleAdminContentRequest(
      new Request(
        'http://localhost/api/admin/community/content?status=deleted&targetType=comment&deletionSource=admin&query=%20spam%20&cursor=next&adminId=leak&limit=50',
      ),
      contentDependencies({
        listContent: async (value) => {
          input = value;
          return { items: [], nextCursor: null };
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(input).toEqual({
      status: 'deleted',
      targetType: 'comment',
      deletionSource: 'admin',
      search: ' spam ',
      cursor: 'next',
    });
  });

  it('forwards only supported sanctions query fields', async () => {
    let input: unknown;
    const response = await handleAdminSanctionsRequest(
      new Request(
        'http://localhost/api/admin/community/sanctions?state=ended&cursor=next&query=drop&limit=50',
      ),
      sanctionsDependencies({
        listSanctions: async (value) => {
          input = value;
          return { items: [], nextCursor: null };
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(input).toEqual({ state: 'ended', cursor: 'next' });
  });

  it('forwards only supported audit query fields', async () => {
    let input: unknown;
    const response = await handleAdminAuditRequest(
      new Request(
        'http://localhost/api/admin/community/audit?action=unrestrict&targetType=user&query=%20review%20&cursor=next&adminId=leak',
      ),
      auditDependencies({
        listAudit: async (value) => {
          input = value;
          return { items: [], nextCursor: null };
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(input).toEqual({
      action: 'unrestrict',
      targetType: 'user',
      search: ' review ',
      cursor: 'next',
    });
  });

  it('maps console validation errors and hides provider details', async () => {
    const privateDetail = 'provider database details';
    const validation = await handleAdminSanctionsRequest(
      new Request('http://localhost/api/admin/community/sanctions?state=active'),
      sanctionsDependencies({
        listSanctions: async () => {
          throw new CommunityAdminConsoleError(
            400,
            'invalid_sanction_state',
            '제재 상태를 확인해 주세요.',
          );
        },
      }),
    );
    const unavailable = await handleAdminAuditRequest(
      new Request('http://localhost/api/admin/community/audit'),
      auditDependencies({
        listAudit: async () => {
          throw new Error(privateDetail);
        },
      }),
    );

    expect(validation.status).toBe(400);
    await expect(validation.json()).resolves.toEqual({
      code: 'invalid_sanction_state',
      error: '제재 상태를 확인해 주세요.',
    });
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('Cache-Control')).toBe('no-store');
    await expect(unavailable.text()).resolves.not.toContain(privateDetail);
  });

  it('maps stale moderation state to a safe conflict', async () => {
    const response = await handleModerationActionRequest(
      new Request('http://localhost/api/admin/community/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'hide' }),
      }),
      actionsDependencies({
        moderate: async () => {
          throw new CommunityModerationError(
            409,
            'moderation_state_conflict',
            '현재 상태에서는 이 관리 조치를 적용할 수 없습니다.',
          );
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      code: 'moderation_state_conflict',
      error: '현재 상태에서는 이 관리 조치를 적용할 수 없습니다.',
    });
  });

  it('maps malformed moderation input to a safe 400', async () => {
    const response = await handleModerationActionRequest(
      new Request('http://localhost/api/admin/community/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
      actionsDependencies(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'invalid_moderation_action',
      error: '관리 조치 내용을 확인해 주세요.',
    });
  });

  it('hides moderation provider and admin registration details', async () => {
    const providerDetail = 'community admin access denied';
    const response = await handleModerationActionRequest(
      new Request('http://localhost/api/admin/community/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'hide' }),
      }),
      actionsDependencies({
        moderate: async () => {
          throw new Error(providerDetail);
        },
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.text()).resolves.not.toContain(providerDetail);
  });
});
