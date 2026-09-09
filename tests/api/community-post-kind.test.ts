import { describe, expect, it } from 'vitest';
import {
  handleAdminPostsRequest,
  type AdminPostsDependencies,
} from '@/app/api/admin/community/posts/route';
import { handlePostKindRequest } from '@/app/api/admin/community/posts/[id]/kind/route';
import { CommunityAdminAuthError } from '@/lib/community/admin-auth';
import { CommunityPostKindError } from '@/lib/community/post-kind-service';

const id = '10000000-0000-4000-8000-000000000001';
const input = {
  title: '공지 제목',
  body: '본문',
  linkUrl: null,
  idempotencyKey: id,
  kind: 'required',
};
function request(method: string, body: unknown = input) {
  return new Request('https://example.com/api/admin/community/posts', {
    method,
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}
function dependencies(): AdminPostsDependencies {
  return {
    enabled: () => true,
    requireAdmin: async () => ({ id }),
    ready: async () => true,
    create: async (_admin, value) => {
      if (value.kind !== 'required' || value.title !== '공지 제목')
        throw new Error();
      return { id };
    },
  };
}
describe('admin post kind API', () => {
  it('returns permission and database readiness separately with no-store', async () => {
    const deps = dependencies();
    deps.ready = async () => false;
    const result = await handleAdminPostsRequest(request('GET'), deps);
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.json()).toEqual({ canManage: true, ready: false });
  });
  it('validates administrator creation and returns the persisted id', async () => {
    const result = await handleAdminPostsRequest(
      request('POST'),
      dependencies(),
    );
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual({ id });
  });
  it.each([401, 403] as const)(
    'rejects unauthenticated or ordinary actors: %s',
    async (status) => {
      const deps = dependencies();
      deps.requireAdmin = async () => {
        throw new CommunityAdminAuthError(status, 'denied', '접근 불가');
      };
      deps.create = async () => {
        throw new Error('must not insert');
      };
      expect(
        (await handleAdminPostsRequest(request('POST'), deps)).status,
      ).toBe(status);
    },
  );
  it('checks feature gate before authentication and validates kind and plaintext', async () => {
    const deps = dependencies();
    deps.enabled = () => false;
    deps.requireAdmin = async () => {
      throw new Error();
    };
    expect((await handleAdminPostsRequest(request('POST'), deps)).status).toBe(
      404,
    );
    for (const body of [
      { ...input, kind: 'owner' },
      { ...input, title: '<b>제목</b>' },
    ]) {
      expect(
        (await handleAdminPostsRequest(request('POST', body), dependencies()))
          .status,
      ).toBe(400);
    }
  });
  it('sanitizes unavailable DB failures', async () => {
    const deps = dependencies();
    deps.create = async () => {
      throw new Error('provider secret');
    };
    const result = await handleAdminPostsRequest(request('POST'), deps);
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('provider secret');
  });
  it('changes kind and rejects missing, hidden or deleted targets', async () => {
    const deps = {
      enabled: () => true,
      requireAdmin: async () => ({ id }),
      change: async () => ({ kind: 'normal' as const }),
    };
    const result = await handlePostKindRequest(
      request('PATCH', { kind: 'normal' }),
      id,
      deps,
    );
    expect(await result.json()).toEqual({ kind: 'normal' });
    expect(
      (
        await handlePostKindRequest(
          request('PATCH', { kind: 'other' }),
          id,
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (await handlePostKindRequest(request('PATCH'), 'bad-id', deps)).status,
    ).toBe(400);
    deps.change = async () => {
      throw new CommunityPostKindError(
        404,
        'post_not_found',
        '글을 찾을 수 없습니다.',
      );
    };
    expect(
      (await handlePostKindRequest(request('PATCH'), id, deps)).status,
    ).toBe(404);
  });
});
