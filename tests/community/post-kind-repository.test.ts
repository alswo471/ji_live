import { beforeEach, describe, expect, it, vi } from 'vitest';
import { communityReadRepository } from '@/lib/community/repository';
import { communityWriteRepository } from '@/lib/community/write-service';

const from = vi.hoisted(() => vi.fn());
vi.mock('@/lib/community/supabase', () => ({
  getServerSupabase: () => ({ from }),
}));
const id = '10000000-0000-4000-8000-000000000001';
function query(result: unknown) {
  const q = Object.assign(Promise.resolve(result), {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    or: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(),
  });
  for (const method of [q.select, q.eq, q.order, q.limit, q.or, q.in])
    method.mockReturnValue(q);
  q.maybeSingle.mockResolvedValue(result);
  return q;
}
beforeEach(() => from.mockReset());
describe('post kind repository boundary', () => {
  it('retains persisted kind when a regular-route retry finds an admin-created post', async () => {
    from.mockReturnValue(
      query({
        data: {
          id,
          author_id: id,
          author_name: '작성자',
          title: '제목',
          body: '본문',
          link_url: null,
          status: 'visible',
          created_at: '2026-04-15T00:00:00.000Z',
          kind: 'required',
        },
        error: null,
      }),
    );
    expect(
      (await communityWriteRepository.findPostByIdempotency(id, id))?.kind,
    ).toBe('required');
  });
  it('orders and filters by the full rank/date/id tuple before limiting the database query', async () => {
    const q = query({ data: [], error: null });
    from.mockReturnValue(q);
    expect(
      await communityReadRepository.findPosts({
        cursor: { kindRank: 1, createdAt: '2026-04-15T00:00:00.000Z', id },
        limit: 3,
      }),
    ).toEqual([]);
    expect(q.order.mock.calls).toEqual([
      ['kind_rank', { ascending: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(q.or).toHaveBeenCalledWith(
      `kind_rank.lt.1,and(kind_rank.eq.1,created_at.lt.2026-04-15T00:00:00.000Z),and(kind_rank.eq.1,created_at.eq.2026-04-15T00:00:00.000Z,id.lt.${id})`,
    );
    expect(q.limit).toHaveBeenCalledWith(3);
  });
  it('falls back only for a missing kind column and never drops ranked cursors', async () => {
    const missing = query({ data: null, error: { code: '42703' } });
    const legacy = query({ data: [], error: null });
    from.mockReturnValueOnce(missing).mockReturnValueOnce(legacy);
    expect(
      await communityReadRepository.findPosts({ cursor: null, limit: 3 }),
    ).toEqual([]);
    expect(legacy.order.mock.calls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    from.mockReturnValue(missing);
    await expect(
      communityReadRepository.findPosts({
        cursor: { kindRank: 2, createdAt: '2026-04-15T00:00:00.000Z', id },
        limit: 3,
      }),
    ).rejects.toThrow();
  });
  it('exposes actual persisted kind and retains legacy detail reads', async () => {
    const row = {
      id,
      author_id: id,
      author_name: '작성자',
      title: '제목',
      body: '본문',
      link_url: null,
      status: 'visible',
      created_at: '2026-04-15T00:00:00.000Z',
    };
    const comments = query({ data: [], error: null });
    const counters = query({ data: null, error: { code: '42703' } });
    from
      .mockReturnValueOnce(
        query({ data: { ...row, kind: 'notice' }, error: null }),
      )
      .mockReturnValueOnce(comments)
      .mockReturnValueOnce(counters);
    expect((await communityReadRepository.findPost(id))?.kind).toBe('notice');
    from
      .mockReturnValueOnce(query({ data: null, error: { code: '42703' } }))
      .mockReturnValueOnce(query({ data: row, error: null }))
      .mockReturnValueOnce(comments)
      .mockReturnValueOnce(counters);
    expect((await communityReadRepository.findPost(id))?.kind).toBe('normal');
  });
});
