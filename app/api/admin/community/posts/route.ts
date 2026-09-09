import {
  CommunityAdminAuthError,
  requireCommunityAdmin,
  type CommunityAdmin,
} from '@/lib/community/admin-auth';
import { isCommunityEnabled } from '@/lib/community/config';
import { validatePostKind } from '@/lib/community/post-kind';
import {
  CommunityPostKindError,
  communityPostKindRepository,
  createAdminPost,
  type AdminPostInput,
} from '@/lib/community/post-kind-service';
import {
  CommunityInputError,
  validatePostInput,
} from '@/lib/community/validation';

export const dynamic = 'force-dynamic';
export function postKindJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
export function postKindError(error: unknown) {
  if (
    error instanceof CommunityAdminAuthError ||
    error instanceof CommunityPostKindError
  ) {
    return postKindJson(
      { code: error.code, error: error.message },
      error.status,
    );
  }
  if (error instanceof CommunityInputError)
    return postKindJson({ code: error.code, error: error.message }, 400);
  if (error instanceof SyntaxError)
    return postKindJson({ error: '요청 내용을 확인해 주세요.' }, 400);
  return postKindJson(
    {
      code: 'post_kind_unavailable',
      error: '글 종류 저장을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    },
    503,
  );
}
export interface AdminPostsDependencies {
  enabled: () => boolean;
  requireAdmin: (request: Request) => Promise<CommunityAdmin>;
  ready: (adminId: string) => Promise<boolean>;
  create: (
    admin: CommunityAdmin,
    input: AdminPostInput,
  ) => Promise<{ id: string }>;
}
const dependencies: AdminPostsDependencies = {
  enabled: isCommunityEnabled,
  requireAdmin: requireCommunityAdmin,
  ready: (id) => communityPostKindRepository.ready(id),
  create: createAdminPost,
};
export async function handleAdminPostsRequest(
  request: Request,
  deps: AdminPostsDependencies = dependencies,
) {
  if (!deps.enabled())
    return postKindJson({ error: '페이지를 찾을 수 없습니다.' }, 404);
  try {
    const admin = await deps.requireAdmin(request);
    if (request.method === 'GET')
      return postKindJson({
        canManage: true,
        ready: await deps.ready(admin.id),
      });
    const body: unknown = await request.json();
    const row =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const kind = validatePostKind(row.kind);
    const input = validatePostInput({ ...row, kind: 'normal' });
    return postKindJson(await deps.create(admin, { ...input, kind }), 201);
  } catch (error) {
    return postKindError(error);
  }
}
export async function GET(request: Request) {
  return handleAdminPostsRequest(request);
}
export async function POST(request: Request) {
  return handleAdminPostsRequest(request);
}
