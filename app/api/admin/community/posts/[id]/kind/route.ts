import {
  requireCommunityAdmin,
  type CommunityAdmin,
} from '@/lib/community/admin-auth';
import { isCommunityEnabled } from '@/lib/community/config';
import {
  validatePostKind,
  type CommunityPostKind,
} from '@/lib/community/post-kind';
import { changePostKind } from '@/lib/community/post-kind-service';
import { isCommunityUuid } from '@/lib/community/read-service';
import { CommunityInputError } from '@/lib/community/validation';
import { postKindJson, postKindError } from '../../route';

export const dynamic = 'force-dynamic';
interface KindDependencies {
  enabled: () => boolean;
  requireAdmin: (request: Request) => Promise<CommunityAdmin>;
  change: (
    admin: CommunityAdmin,
    id: string,
    kind: CommunityPostKind,
  ) => Promise<{ kind: CommunityPostKind }>;
}
const dependencies: KindDependencies = {
  enabled: isCommunityEnabled,
  requireAdmin: requireCommunityAdmin,
  change: changePostKind,
};
export async function handlePostKindRequest(
  request: Request,
  id: string,
  deps: KindDependencies = dependencies,
) {
  if (!deps.enabled())
    return postKindJson({ error: '페이지를 찾을 수 없습니다.' }, 404);
  try {
    const admin = await deps.requireAdmin(request);
    if (!isCommunityUuid(id))
      throw new CommunityInputError(
        'invalid_post_id',
        '게시글 정보를 확인해 주세요.',
      );
    const body: unknown = await request.json();
    const kind = validatePostKind(
      body && typeof body === 'object'
        ? (body as { kind?: unknown }).kind
        : undefined,
    );
    return postKindJson(await deps.change(admin, id.toLowerCase(), kind));
  } catch (error) {
    return postKindError(error);
  }
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlePostKindRequest(request, (await context.params).id);
}
