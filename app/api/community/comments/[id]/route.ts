import {
  authenticateCommunityUser,
  CommunityAuthError,
} from '@/lib/community/auth';
import { isCommunityEnabled } from '@/lib/community/config';
import { isCommunityUuid } from '@/lib/community/read-service';
import {
  deleteComment,
  CommunityWriteError,
} from '@/lib/community/write-service';

export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export interface CommunityDeleteCommentRouteDependencies {
  enabled: typeof isCommunityEnabled;
  authenticate: typeof authenticateCommunityUser;
  deleteComment: typeof deleteComment;
}

const dependencies: CommunityDeleteCommentRouteDependencies = {
  enabled: isCommunityEnabled,
  authenticate: authenticateCommunityUser,
  deleteComment,
};

export async function handleDeleteCommentRequest(
  request: Request,
  rawId: string,
  deps: CommunityDeleteCommentRouteDependencies = dependencies,
) {
  if (!deps.enabled())
    return noStoreJson({ error: '페이지를 찾을 수 없습니다.' }, 404);
  if (!isCommunityUuid(rawId)) {
    return noStoreJson(
      { code: 'invalid_comment_id', error: '댓글 정보를 확인할 수 없습니다.' },
      400,
    );
  }

  try {
    await deps.deleteComment(
      await deps.authenticate(request),
      rawId.toLowerCase(),
    );
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (
      error instanceof CommunityAuthError ||
      error instanceof CommunityWriteError
    ) {
      return noStoreJson(
        { code: error.code, error: error.message },
        error.status,
      );
    }
    return noStoreJson(
      {
        code: 'community_write_unavailable',
        error: '커뮤니티 요청을 처리하지 못했습니다.',
      },
      503,
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id } = await context.params;
  return handleDeleteCommentRequest(request, id);
}
