import { describe, expect, it, vi } from 'vitest';
import { validateCommentInput } from '@/lib/community/validation';
import { listComments } from '@/lib/community/read-service';
import type { CommunityReadRepository } from '@/lib/community/repository';
import {
  createComment,
  type CommunityWriteRepository,
} from '@/lib/community/write-service';

const post = '10000000-0000-4000-8000-000000000001';
const parent = '20000000-0000-4000-8000-000000000001';
const key = '30000000-0000-4000-8000-000000000001';
const actor = { id: key, isAnonymous: true, email: null };
const row = {
  id: parent,
  postId: post,
  authorId: key,
  authorName: '원문 작성자',
  body: '비밀 원문',
  status: 'visible' as const,
  parentStatus: 'visible' as const,
  createdAt: '2026-09-09T01:00:00.123456+00:00',
};

describe('reply boundaries', () => {
  it('keeps normalized parent UUID and emoji, rejects malformed parent values', () => {
    expect(
      validateCommentInput({
        body: '답글 😀',
        idempotencyKey: key,
        parentCommentId: parent,
      }),
    ).toMatchObject({ body: '답글 😀', parentCommentId: parent });
    for (const value of ['invalid', '', 42, {}])
      expect(() =>
        validateCommentInput({
          body: '답글',
          idempotencyKey: key,
          parentCommentId: value,
        }),
      ).toThrow();
  });
  it('redacts unavailable roots defensively while preserving reply counts', async () => {
    const repository = {
      findCommentThreads: async () => ({
        items: [
          {
            ...row,
            status: 'hidden',
            unavailable: true,
            replyCount: 2,
            parentCommentId: null,
          },
        ],
        repliesEnabled: true,
      }),
      findComments: async () => [],
    } as unknown as CommunityReadRepository;
    const page = await listComments(post, null, 30, key, repository);
    expect(page.repliesEnabled).toBe(true);
    expect(page.items).toEqual([
      {
        id: parent,
        postId: post,
        authorName: '',
        body: '삭제·숨김 처리된 댓글입니다.',
        createdAt: row.createdAt,
        canDelete: false,
        parentCommentId: null,
        replyCount: 2,
        unavailable: true,
      },
    ]);
    expect(JSON.stringify(page)).not.toContain('비밀 원문');
  });
  it('keeps database timestamp order and rejects cursors from another parent or root scope', async () => {
    const repository = {
      findCommentThreads: async () => ({
        items: [
          row,
          { ...row, id: key, createdAt: '2026-09-09T01:00:00+00:00' },
        ],
        repliesEnabled: true,
      }),
      findComments: async () => [],
    } as unknown as CommunityReadRepository;
    const first = await listComments(post, null, 1, null, repository, parent);
    expect(first.items[0].createdAt).toBe(row.createdAt);
    expect(first.nextCursor).not.toBeNull();
    await expect(
      listComments(post, first.nextCursor, 1, null, repository),
    ).rejects.toMatchObject({ code: 'invalid_cursor' });
    await expect(
      listComments(post, first.nextCursor, 1, null, repository, key),
    ).rejects.toMatchObject({ code: 'invalid_cursor' });
  });
  it('rejects hidden retry content and mismatched post, body or parent payload', async () => {
    for (const existing of [
      { ...row, status: 'hidden' },
      row,
      { ...row, body: '답글', postId: parent },
      { ...row, body: '답글', parentCommentId: parent },
    ]) {
      const repository = {
        findCommentByIdempotency: async () => existing,
      } as unknown as CommunityWriteRepository;
      await expect(
        createComment(
          actor,
          post,
          { body: '답글', idempotencyKey: key },
          { abuseKey: 'a'.repeat(64) },
          repository,
        ),
      ).rejects.toThrow();
    }
  });
  it('uses the atomic path after rate limiting even on retries', async () => {
    const events: string[] = [];
    const repository = {
      atomicComments: true,
      findCommentByIdempotency: vi.fn(() => {
        throw new Error('legacy retry bypass');
      }),
      isRestricted: async () => false,
      consumeRateLimit: async () => {
        events.push('limit');
        return { allowed: true };
      },
      getOrCreateProfileName: async () => '작성자',
      insertComment: async () => {
        events.push('insert');
        return { ...row, parentCommentId: parent };
      },
    } as unknown as CommunityWriteRepository;
    const result = await createComment(
      actor,
      post,
      { body: '답글', idempotencyKey: key, parentCommentId: parent },
      { abuseKey: 'a'.repeat(64) },
      repository,
      async () => '작성자',
    );
    expect(events).toEqual(['limit', 'insert']);
    expect(result.parentCommentId).toBe(parent);
  });
});
