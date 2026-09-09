import { afterEach, expect, it, vi } from 'vitest';
import {
  findCommentThreads,
  isMissingCommentRpc,
} from '@/lib/community/reply-repository';
import { communityWriteRepository } from '@/lib/community/write-service';
const { client } = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('@/lib/community/supabase', () => ({ getServerSupabase: client }));
afterEach(() => vi.resetAllMocks());
const post = '10000000-0000-4000-8000-000000000001';
const parent = '20000000-0000-4000-8000-000000000001';
const key = '30000000-0000-4000-8000-000000000001';
const missing = (name: string) => ({
  code: 'PGRST202',
  message: `Could not find the function public.${name}(p_actor_id) in the schema cache`,
});
const query = { cursor: null, limit: 31 };

it.each(['read_community_comments', 'create_community_comment'])(
  'matches only the exact public %s identity in a provider missing-function error',
  (name) => {
    for (const [code, prefix] of [
      ['PGRST202', 'Could not find the function '],
      ['42883', 'function '],
    ]) {
      expect(
        isMissingCommentRpc(
          { code, message: `${prefix}public.${name}(uuid) does not exist` },
          name,
        ),
      ).toBe(true);
      for (const identity of [
        `public.internal_${name}`,
        `private.${name}`,
        `not_public.${name}`,
        `public.${name}_internal`,
        name,
      ]) {
        expect(
          isMissingCommentRpc(
            { code, message: `${prefix}${identity}(uuid) does not exist` },
            name,
          ),
        ).toBe(false);
      }
      expect(
        isMissingCommentRpc(
          {
            code,
            message: `${prefix}public.internal_rpc(uuid) failed while invoking public.${name}(uuid)`,
          },
          name,
        ),
      ).toBe(false);
    }
  },
);

it('propagates missing internal-function errors instead of using root read or write fallbacks', async () => {
  const input = {
    actorId: key,
    authorName: '작성자',
    postId: post,
    input: { body: '원댓글', idempotencyKey: key },
  };
  for (const identity of ['public.internal_', 'private.']) {
    client.mockReturnValue({
      rpc: async () => ({
        error: {
          code: '42883',
          message: `function ${identity}read_community_comments(uuid) does not exist`,
        },
      }),
    });
    await expect(
      findCommentThreads(post, null, query, async () => []),
    ).rejects.toThrow('커뮤니티 데이터를');
    client.mockReturnValue({
      rpc: async () => ({
        error: {
          code: '42883',
          message: `function ${identity}create_community_comment(uuid) does not exist`,
        },
      }),
      from: () => {
        throw new Error('unexpected legacy root write');
      },
    });
    await expect(
      communityWriteRepository.insertComment(input),
    ).rejects.toMatchObject({ code: 'community_write_unavailable' });
  }
});

it('falls back only for roots when the exact read RPC is absent', async () => {
  client.mockReturnValue({
    rpc: async () => ({ error: missing('read_community_comments') }),
  });
  expect(await findCommentThreads(post, null, query, async () => [])).toEqual({
    items: [],
    repliesEnabled: false,
  });
  await expect(
    findCommentThreads(post, parent, query, async () => {
      throw new Error('must not fall back');
    }),
  ).rejects.toThrow('커뮤니티 데이터를');
  for (const error of [
    { code: '42501', message: 'denied' },
    { code: 'PGRST000', message: 'network' },
    missing('unrelated_function'),
    { code: '42703', message: 'column unrelated does not exist' },
  ]) {
    client.mockReturnValue({ rpc: async () => ({ error }) });
    await expect(
      findCommentThreads(post, null, query, async () => {
        throw new Error('must not fall back');
      }),
    ).rejects.toThrow('커뮤니티 데이터를');
  }
});

it('preserves snake-case RPC order and microseconds while rejecting malformed rows', async () => {
  const data = [
    {
      id: parent,
      post_id: post,
      parent_comment_id: null,
      author_id: null,
      author_name: '',
      body: '삭제·숨김 처리된 댓글입니다.',
      status: 'hidden',
      unavailable: true,
      reply_count: 1,
      created_at: '2026-09-09T01:00:00.123456+00:00',
    },
  ];
  client.mockReturnValue({
    rpc: async (_name: string, input: Record<string, unknown>) => {
      expect(input).toEqual({
        p_post_id: post,
        p_parent_comment_id: null,
        p_before_created_at: null,
        p_before_id: null,
        p_limit: 31,
      });
      return { data, error: null };
    },
  });
  const result = await findCommentThreads(post, null, query, async () => []);
  expect(result.items[0]).toMatchObject({
    unavailable: true,
    authorId: '',
    replyCount: 1,
    createdAt: '2026-09-09T01:00:00.123456+00:00',
  });
  client.mockReturnValue({
    rpc: async () => ({ data: [{ ...data[0], reply_count: -1 }], error: null }),
  });
  await expect(
    findCommentThreads(post, null, query, async () => []),
  ).rejects.toThrow();
});

it('never silently writes a reply or falls back on network and permission errors', async () => {
  const input = {
    actorId: key,
    authorName: '작성자',
    postId: post,
    input: { body: '답글', idempotencyKey: key, parentCommentId: parent },
  };
  for (const error of [
    missing('create_community_comment'),
    { code: '42501' },
    { code: 'PGRST000' },
  ]) {
    client.mockReturnValue({
      rpc: async () => ({ error }),
      from: () => {
        throw new Error('unexpected legacy path');
      },
    });
    await expect(
      communityWriteRepository.insertComment(input),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^community_/) });
  }
});

it('keeps old-database root creation and safe idempotency retries working', async () => {
  const row = {
    id: parent,
    post_id: post,
    author_id: key,
    author_name: '작성자',
    body: '원댓글',
    status: 'visible',
    created_at: '2026-09-09T01:00:00Z',
  };
  let saved: typeof row | null = null;
  let inserts = 0;
  client.mockReturnValue({
    rpc: async () => ({ error: missing('create_community_comment') }),
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: table === 'community_posts' ? { id: post } : saved,
          error: null,
        }),
        insert: (value: Record<string, unknown>) => {
          expect(value).not.toHaveProperty('parent_comment_id');
          ++inserts;
          saved = row;
          return builder;
        },
        single: async () => ({ data: saved, error: null }),
      };
      return builder;
    },
  });
  const input = {
    actorId: key,
    authorName: '작성자',
    postId: post,
    input: { body: '원댓글', idempotencyKey: key },
  };
  expect((await communityWriteRepository.insertComment(input)).id).toBe(parent);
  expect((await communityWriteRepository.insertComment(input)).id).toBe(parent);
  expect(inserts).toBe(1);
  await expect(
    communityWriteRepository.insertComment({
      ...input,
      input: { ...input.input, body: '다른 내용' },
    }),
  ).rejects.toMatchObject({ status: 409 });
});
