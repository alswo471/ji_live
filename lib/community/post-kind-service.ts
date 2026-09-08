import type { CommunityAdmin } from './admin-auth';
import { createAnonymousName } from './nickname';
import { validatePostKind, type CommunityPostKind } from './post-kind';
import { isCommunityUuid } from './read-service';
import { getServerSupabase } from './supabase';
import type { PostInput } from './types';

export type AdminPostInput = PostInput & { kind: CommunityPostKind };
export class CommunityPostKindError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function unavailable(): never {
  throw new CommunityPostKindError(
    503,
    'post_kind_unavailable',
    '글 종류 저장을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  );
}
function providerError(error: { code?: string }): never {
  if (error.code === '42501')
    throw new CommunityPostKindError(
      403,
      'admin_access_denied',
      '관리자 권한 또는 활동 제한을 확인해 주세요.',
    );
  if (error.code === 'P0002')
    throw new CommunityPostKindError(
      404,
      'post_not_found',
      '공개된 게시글을 찾을 수 없습니다.',
    );
  if (error.code === '23505')
    throw new CommunityPostKindError(
      409,
      'duplicate_request',
      '이미 처리된 요청입니다.',
    );
  unavailable();
}

export interface PostKindRepository {
  ready(adminId: string): Promise<boolean>;
  create(
    adminId: string,
    authorName: string,
    input: AdminPostInput,
  ): Promise<{ id: string }>;
  change(
    adminId: string,
    id: string,
    kind: CommunityPostKind,
  ): Promise<{ kind: CommunityPostKind }>;
}

export const communityPostKindRepository: PostKindRepository = {
  async ready(adminId) {
    const { data, error } = await getServerSupabase().rpc(
      'community_post_kind_ready',
      { p_admin_id: adminId },
    );
    if (error && ['PGRST202', '42883', '42703'].includes(error.code))
      return false;
    if (error) providerError(error);
    if (data !== true) unavailable();
    return true;
  },
  async create(adminId, authorName, input) {
    const { data, error } = await getServerSupabase().rpc(
      'create_community_admin_post',
      {
        p_admin_id: adminId,
        p_author_name: authorName,
        p_title: input.title,
        p_body: input.body,
        p_link_url: input.linkUrl,
        p_idempotency_key: input.idempotencyKey,
        p_kind: input.kind,
      },
    );
    if (error) providerError(error);
    if (!data || typeof data.id !== 'string' || !isCommunityUuid(data.id))
      unavailable();
    return { id: data.id as string };
  },
  async change(adminId, id, kind) {
    const { data, error } = await getServerSupabase().rpc(
      'set_community_post_kind',
      { p_admin_id: adminId, p_post_id: id, p_kind: kind },
    );
    if (error) providerError(error);
    try {
      return { kind: validatePostKind(data?.kind) };
    } catch {
      unavailable();
    }
  },
};

export async function createAdminPost(
  admin: CommunityAdmin,
  input: AdminPostInput,
  repository: PostKindRepository = communityPostKindRepository,
  nameFactory = createAnonymousName,
) {
  return repository.create(admin.id, await nameFactory(admin.id), input);
}
export async function changePostKind(
  admin: CommunityAdmin,
  id: string,
  kind: CommunityPostKind,
  repository: PostKindRepository = communityPostKindRepository,
) {
  return repository.change(admin.id, id, kind);
}
