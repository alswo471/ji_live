import { describe, expect, it } from 'vitest';
import { validatePostInput } from '@/lib/community/validation';
import * as postKind from '@/lib/community/post-kind';

describe('community post kind contract', () => {
  it('formats calendar dates in Seoul across midnight', () => {
    expect(postKind.formatCommunityDate('2026-04-14T15:00:00.000Z')).toBe(
      '2026.04.15.',
    );
    expect(postKind.formatCommunityDate('2026-04-14T14:59:59.000Z')).toBe(
      '2026.04.14.',
    );
  });
  it.each(['normal', 'notice', 'required'])(
    'accepts persisted kind %s',
    (kind) => {
      expect(postKind.validatePostKind(kind)).toBe(kind);
    },
  );
  it.each([undefined, null, '', 'admin', 1])(
    'rejects invalid kind %s',
    (kind) => {
      expect(() => postKind.validatePostKind(kind)).toThrow();
    },
  );
  it.each(['notice', 'required'])(
    'rejects privilege injection on regular writes: %s',
    (kind) => {
      expect(() =>
        validatePostInput({
          title: '공지 제목',
          body: '내용',
          linkUrl: null,
          idempotencyKey: '10000000-0000-4000-8000-000000000001',
          kind,
        }),
      ).toThrow();
    },
  );
});
