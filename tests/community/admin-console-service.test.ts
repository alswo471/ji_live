import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CommunityAdminConsoleError,
  adminConsoleRepository,
  getAdminSummary,
  listAdminAudit,
  listAdminContent,
  listAdminSanctions,
  validateAdminTab,
  type AdminConsoleRepository,
  type AdminContentRecord,
} from '@/lib/community/admin-console-service';

const { getServerSupabaseMock } = vi.hoisted(() => ({
  getServerSupabaseMock: vi.fn(),
}));

vi.mock('@/lib/community/supabase', () => ({
  getServerSupabase: getServerSupabaseMock,
}));

const AUTHOR_ID = '30000000-0000-4000-8000-000000000001';
const POST_ID = '40000000-0000-4000-8000-000000000001';
const SECOND_POST_ID = '40000000-0000-4000-8000-000000000002';
const SANCTION_ID = '50000000-0000-4000-8000-000000000001';
const AUDIT_ID = '60000000-0000-4000-8000-000000000001';
const SECRET = 'test-secret-at-least-32-characters';

afterEach(() => {
  getServerSupabaseMock.mockReset();
});

function contentRecord(
  overrides: Partial<AdminContentRecord> = {},
): AdminContentRecord {
  return {
    targetType: 'post',
    targetId: POST_ID,
    authorId: AUTHOR_ID,
    authorName: '차분한-고양이-0001',
    title: '삭제한 글',
    body: '삭제된 글의 본문입니다.',
    status: 'deleted',
    deletionSource: 'author',
    deletedAt: '2026-09-04T05:00:00.000Z',
    purgeAt: '2027-09-04T05:00:00.000Z',
    createdAt: '2026-09-03T05:00:00.000Z',
    ...overrides,
  };
}

function repository(
  overrides: Partial<AdminConsoleRepository> = {},
): AdminConsoleRepository {
  return {
    loadSummary: async () => ({
      reports: 0,
      hidden: 0,
      trash: 0,
      sanctions: 0,
    }),
    findContent: async () => [],
    findSanctions: async () => [],
    findAudit: async () => [],
    ...overrides,
  };
}

describe('admin console input validation', () => {
  it.each(['unknown', '', null])('rejects an invalid admin tab: %s', (tab) => {
    expect(() => validateAdminTab(tab)).toThrow(CommunityAdminConsoleError);
    expect(() => validateAdminTab(tab)).toThrow(
      expect.objectContaining({ status: 400, code: 'invalid_admin_tab' }),
    );
  });

  it.each([
    [{ status: 'archived' }, 'invalid_content_status'],
    [{ status: 'deleted', targetType: 'user' }, 'invalid_target_type'],
    [
      { status: 'deleted', deletionSource: 'system' },
      'invalid_deletion_source',
    ],
    [{ status: 'deleted', search: '가'.repeat(101) }, 'invalid_admin_search'],
    [{ status: 'deleted', cursor: 'tampered' }, 'invalid_admin_cursor'],
  ] as const)('rejects invalid content input with %s', async (input, code) => {
    await expect(
      listAdminContent(input, repository(), SECRET),
    ).rejects.toMatchObject({ status: 400, code });
  });
});

describe('admin console content', () => {
  it('maps deleted content to a privacy-safe browser DTO', async () => {
    const page = await listAdminContent(
      {
        status: 'deleted',
        targetType: 'post',
        deletionSource: 'author',
        search: ' 삭제한 글 ',
      },
      repository({ findContent: async () => [contentRecord()] }),
      SECRET,
    );

    expect(page.items[0]).toMatchObject({
      targetType: 'post',
      status: 'deleted',
      deletionSource: 'author',
      actorLabel: expect.stringMatching(/^익명 사용자 #[A-F0-9]{4}$/),
      purgeAt: '2027-09-04T05:00:00.000Z',
    });
    expect(page.items[0]).not.toHaveProperty('authorId');
    expect(page.items[0]).not.toHaveProperty('reporterId');
    expect(JSON.stringify(page)).not.toContain(AUTHOR_ID);
  });

  it('caps the page size and decodes its own URL-safe cursor', async () => {
    let received: unknown;
    const firstPage = await listAdminContent(
      { status: 'deleted', limit: 1 },
      repository({
        findContent: async (query) => {
          received = query;
          return [contentRecord(), contentRecord({ targetId: SECOND_POST_ID })];
        },
      }),
      SECRET,
    );

    expect(received).toMatchObject({
      status: 'deleted',
      targetType: 'all',
      deletionSource: 'all',
      search: '',
      cursor: null,
      limit: 2,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);

    await listAdminContent(
      { status: 'deleted', cursor: firstPage.nextCursor, limit: 999 },
      repository({
        findContent: async (query) => {
          received = query;
          return [];
        },
      }),
      SECRET,
    );

    expect(received).toMatchObject({
      cursor: {
        sortAt: '2026-09-04T05:00:00.000Z',
        targetType: 'post',
        targetId: POST_ID,
      },
      limit: 51,
    });
  });

  it.each([
    [
      '시장, (급등) "주의"',
      'title.ilike."%시장, (급등) \\"주의\\"%",body.ilike."%시장, (급등) \\"주의\\"%"',
    ],
    [
      '100%_\\경로',
      'title.ilike."%100\\\\%\\\\_\\\\\\\\경로%",body.ilike."%100\\\\%\\\\_\\\\\\\\경로%"',
    ],
  ])(
    'keeps PostgREST punctuation inside a single search value: %s',
    async (search, expectedFilter) => {
      const filters: string[] = [];
      const query = {
        select: () => query,
        eq: () => query,
        or: (filter: string) => {
          filters.push(filter);
          return query;
        },
        order: () => query,
        limit: async () => ({ data: [], error: null }),
      };
      getServerSupabaseMock.mockReturnValue({
        from: () => query,
      });

      await adminConsoleRepository.findContent({
        status: 'deleted',
        targetType: 'all',
        deletionSource: 'all',
        search,
        cursor: null,
        limit: 21,
      });

      expect(filters).toEqual([expectedFilter]);
    },
  );
});

describe('admin console summary, sanctions and audit', () => {
  it('returns the four operational summary counts', async () => {
    await expect(
      getAdminSummary(
        repository({
          loadSummary: async () => ({
            reports: 3,
            hidden: 4,
            trash: 5,
            sanctions: 6,
          }),
        }),
      ),
    ).resolves.toEqual({ reports: 3, hidden: 4, trash: 5, sanctions: 6 });
  });

  it('maps sanctions without exposing the sanctioned user UUID', async () => {
    const page = await listAdminSanctions(
      { state: 'active' },
      repository({
        findSanctions: async () => [
          {
            id: SANCTION_ID,
            userId: AUTHOR_ID,
            reason: '반복적인 운영정책 위반',
            startsAt: '2026-09-04T05:00:00.000Z',
            endsAt: '2026-09-11T05:00:00.000Z',
            revokedAt: null,
            createdAt: '2026-09-04T05:00:00.000Z',
          },
        ],
      }),
      SECRET,
      new Date('2026-09-05T05:00:00.000Z'),
    );

    expect(page.items[0]).toMatchObject({
      sanctionId: SANCTION_ID,
      actorLabel: expect.stringMatching(/^익명 사용자 #[A-F0-9]{4}$/),
      state: 'active',
    });
    expect(page.items[0]).not.toHaveProperty('userId');
    expect(JSON.stringify(page)).not.toContain(AUTHOR_ID);
  });

  it('maps audit entries without exposing admin or target user UUIDs', async () => {
    const page = await listAdminAudit(
      { action: 'restrict', targetType: 'user' },
      repository({
        findAudit: async () => [
          {
            id: AUDIT_ID,
            adminId: '10000000-0000-4000-8000-000000000001',
            action: 'restrict',
            targetType: 'user',
            targetId: AUTHOR_ID,
            targetAuthorId: AUTHOR_ID,
            targetTitle: null,
            targetBody: null,
            reason: '반복적인 운영정책 위반',
            createdAt: '2026-09-04T05:00:00.000Z',
          },
        ],
      }),
      SECRET,
    );

    expect(page.items[0]).toMatchObject({
      id: AUDIT_ID,
      action: 'restrict',
      targetType: 'user',
      actorLabel: expect.stringMatching(/^익명 사용자 #[A-F0-9]{4}$/),
    });
    expect(page.items[0]).not.toHaveProperty('adminId');
    expect(page.items[0]).not.toHaveProperty('targetAuthorId');
    expect(page.items[0]).not.toHaveProperty('targetId');
    expect(JSON.stringify(page)).not.toContain(AUTHOR_ID);
  });
});
