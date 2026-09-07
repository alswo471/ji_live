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
    hiddenSource: null,
    hiddenReason: null,
    hiddenAt: null,
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

  it.each([
    { from: '2026-02-30' },
    { to: '09-04-2026' },
    { from: '2026-09-05', to: '2026-09-04' },
  ])('rejects an invalid audit date range: %s', async (input) => {
    await expect(
      listAdminAudit(input, repository(), SECRET),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_audit_period' });
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

  it('exposes privacy-safe hidden metadata and cursors by the latest hide time', async () => {
    let received: unknown;
    const hiddenAt = '2026-09-04T06:00:00.000Z';
    const firstPage = await listAdminContent(
      { status: 'hidden', limit: 1 },
      repository({
        findContent: async (query) => {
          received = query;
          return [
            contentRecord({
              status: 'hidden',
              deletionSource: null,
              deletedAt: null,
              purgeAt: null,
              hiddenSource: 'automatic',
              hiddenReason: '서로 다른 네트워크의 신고 10건',
              hiddenAt,
            }),
            contentRecord({ targetId: SECOND_POST_ID }),
          ];
        },
      }),
      SECRET,
    );

    expect(received).toMatchObject({ status: 'hidden' });
    expect(firstPage.items[0]).toMatchObject({
      hiddenSource: 'automatic',
      hiddenReason: '서로 다른 네트워크의 신고 10건',
      hiddenAt,
    });

    await listAdminContent(
      { status: 'hidden', cursor: firstPage.nextCursor },
      repository({
        findContent: async (query) => {
          received = query;
          return [];
        },
      }),
      SECRET,
    );
    expect(received).toMatchObject({ cursor: { sortAt: hiddenAt } });
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
    let received: unknown;
    const page = await listAdminAudit(
      { action: 'restrict', targetType: 'user' },
      repository({
        findAudit: async (query) => {
          received = query;
          return [
            {
              id: AUDIT_ID,
              adminId: '10000000-0000-4000-8000-000000000001',
              action: 'restrict',
              targetType: 'user',
              targetId: AUTHOR_ID,
              targetAuthorId: AUTHOR_ID,
              targetTitle: null,
              targetBody: null,
              deletionSource: null,
              reason: '반복적인 운영정책 위반',
              createdAt: '2026-09-04T05:00:00.000Z',
            },
          ];
        },
      }),
      SECRET,
    );

    expect(page.items[0]).toMatchObject({
      id: AUDIT_ID,
      action: 'restrict',
      targetType: 'user',
      targetUserLabel: expect.stringMatching(/^익명 사용자 #[A-F0-9]{4}$/),
    });
    expect(page.items[0]).not.toHaveProperty('actorLabel');
    expect(page.items[0]).not.toHaveProperty('adminId');
    expect(page.items[0]).not.toHaveProperty('targetAuthorId');
    expect(page.items[0]).not.toHaveProperty('targetId');
    expect(JSON.stringify(page)).not.toContain(AUTHOR_ID);
    expect(received).toMatchObject({ from: null, to: null });
  });

  it('accepts dismissal, user targets, deletion source, and combined snapshot search', async () => {
    let received: unknown;
    const page = await listAdminAudit(
      {
        action: 'dismiss',
        targetType: 'user',
        deletionSource: 'author',
        search: ' 이전 제목 ',
      },
      repository({
        findAudit: async (query) => {
          received = query;
          return [];
        },
      }),
      SECRET,
    );

    expect(page.items).toEqual([]);
    expect(received).toMatchObject({
      action: 'dismiss',
      targetType: 'user',
      deletionSource: 'author',
      search: '이전 제목',
    });
  });

  it('queries immutable audit snapshots across reason, title, and body', async () => {
    const equalities: Array<[string, string]> = [];
    const disjunctions: string[] = [];
    const selections: string[] = [];
    const query = {
      select: (columns: string) => {
        selections.push(columns);
        return query;
      },
      eq: (column: string, value: string) => {
        equalities.push([column, value]);
        return query;
      },
      gte: () => query,
      lt: () => query,
      or: (filter: string) => {
        disjunctions.push(filter);
        return query;
      },
      order: () => query,
      limit: async () => ({
        data: [
          {
            id: AUDIT_ID,
            admin_id: '10000000-0000-4000-8000-000000000001',
            action: 'delete',
            target_type: 'post',
            post_id: POST_ID,
            comment_id: null,
            user_id: null,
            reason: '관리자 삭제 처리',
            created_at: '2026-09-04T05:00:00.000Z',
            target_title_snapshot: '파기 뒤에도 남는 제목',
            target_body_snapshot: '파기 뒤에도 남는 본문',
            deletion_source: 'admin',
            community_posts: null,
            community_comments: null,
          },
        ],
        error: null,
      }),
    };
    getServerSupabaseMock.mockReturnValue({ from: () => query });

    const records = await adminConsoleRepository.findAudit({
      action: 'delete',
      targetType: 'post',
      deletionSource: 'admin',
      from: null,
      to: null,
      search: '파기 뒤',
      cursor: null,
      limit: 21,
    });

    expect(selections[0]).toContain('target_title_snapshot');
    expect(selections[0]).not.toContain('community_posts(id,author_id,title,body)');
    expect(equalities).toEqual([
      ['action', 'delete'],
      ['target_type', 'post'],
      ['deletion_source', 'admin'],
    ]);
    expect(disjunctions).toEqual([
      'reason.ilike."%파기 뒤%",target_title_snapshot.ilike."%파기 뒤%",target_body_snapshot.ilike."%파기 뒤%"',
    ]);
    expect(records[0]).toMatchObject({
      targetTitle: '파기 뒤에도 남는 제목',
      targetBody: '파기 뒤에도 남는 본문',
      deletionSource: 'admin',
    });
  });

  it('normalizes audit dates to inclusive and exclusive UTC boundaries', async () => {
    let received: unknown;

    await listAdminAudit(
      { from: '2026-09-01', to: '2026-09-04' },
      repository({
        findAudit: async (query) => {
          received = query;
          return [];
        },
      }),
      SECRET,
    );

    expect(received).toMatchObject({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-05T00:00:00.000Z',
    });
  });

  it('applies both UTC boundaries to the audit repository query', async () => {
    const ranges: Array<[string, string, string]> = [];
    const query = {
      select: () => query,
      eq: () => query,
      gte: (column: string, value: string) => {
        ranges.push(['gte', column, value]);
        return query;
      },
      lt: (column: string, value: string) => {
        ranges.push(['lt', column, value]);
        return query;
      },
      ilike: () => query,
      or: () => query,
      order: () => query,
      limit: async () => ({ data: [], error: null }),
    };
    getServerSupabaseMock.mockReturnValue({ from: () => query });

    await adminConsoleRepository.findAudit({
      action: 'all',
      targetType: 'all',
      deletionSource: 'all',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-05T00:00:00.000Z',
      search: '',
      cursor: null,
      limit: 21,
    });

    expect(ranges).toEqual([
      ['gte', 'created_at', '2026-09-01T00:00:00.000Z'],
      ['lt', 'created_at', '2026-09-05T00:00:00.000Z'],
    ]);
  });
});
