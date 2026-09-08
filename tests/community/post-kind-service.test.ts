import { describe, expect, it, vi } from 'vitest';
import {
  createAdminPost,
  changePostKind,
  communityPostKindRepository,
} from '@/lib/community/post-kind-service';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/community/supabase', () => ({
  getServerSupabase: () => ({ rpc }),
}));
const admin = { id: '10000000-0000-4000-8000-000000000001' };
const input = {
  title: '제목',
  body: '본문',
  linkUrl: null,
  idempotencyKey: admin.id,
  kind: 'notice' as const,
};
describe('post kind service', () => {
  it('sends actor and exact kind to one atomic create transaction', async () => {
    rpc.mockImplementation(async (name, args) => {
      if (
        name !== 'create_community_admin_post' ||
        args.p_admin_id !== admin.id ||
        args.p_kind !== 'notice' ||
        args.p_idempotency_key !== admin.id
      )
        throw new Error();
      return { data: { id: admin.id }, error: null };
    });
    expect(
      await createAdminPost(
        admin,
        input,
        communityPostKindRepository,
        async () => '이름-검증',
      ),
    ).toEqual({ id: admin.id });
  });
  it('returns database persisted kind and maps permission/not-found/unavailable safely', async () => {
    rpc.mockResolvedValueOnce({ data: { kind: 'required' }, error: null });
    expect(await changePostKind(admin, admin.id, 'required')).toEqual({
      kind: 'required',
    });
    for (const [code, status] of [
      ['42501', 403],
      ['P0002', 404],
      ['42883', 503],
    ]) {
      rpc.mockResolvedValueOnce({
        data: null,
        error: { code, message: 'secret' },
      });
      await expect(
        changePostKind(admin, admin.id, 'normal'),
      ).rejects.toMatchObject({ status });
    }
  });
  it('reports missing migration as not ready, but preserves membership rejection', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
    expect(await communityPostKindRepository.ready(admin.id)).toBe(false);
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(
      communityPostKindRepository.ready(admin.id),
    ).rejects.toMatchObject({ status: 403 });
  });
});
