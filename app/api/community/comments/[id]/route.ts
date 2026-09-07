import {
  authenticateCommunityUser,
  CommunityAuthError,
} from '@/lib/community/auth';
import {
  createDailyAbuseKey,
  CommunitySecurityError,
  getTrustedClientIp,
} from '@/lib/community/abuse-key';
import { isCommunityEnabled } from '@/lib/community/config';
import { isCommunityUuid } from '@/lib/community/read-service';
import {
  deleteComment,
  CommunityWriteError,
} from '@/lib/community/write-service';
import { verifyTurnstile } from '@/lib/community/turnstile';

export const dynamic = 'force-dynamic';

function noStoreJson(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export interface CommunityDeleteCommentRouteDependencies {
  enabled: typeof isCommunityEnabled;
  authenticate: typeof authenticateCommunityUser;
  resolveClientIp: typeof getTrustedClientIp;
  verifyHuman: typeof verifyTurnstile;
  createAbuseKey: typeof createDailyAbuseKey;
  deleteComment: typeof deleteComment;
}

const dependencies: CommunityDeleteCommentRouteDependencies = {
  enabled: isCommunityEnabled,
  authenticate: authenticateCommunityUser,
  resolveClientIp: getTrustedClientIp,
  verifyHuman: verifyTurnstile,
  createAbuseKey: createDailyAbuseKey,
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
    const actor = await deps.authenticate(request);
    const clientIp = deps.resolveClientIp(request);
    if (
      !(await deps.verifyHuman(
        request.headers.get('x-turnstile-token') ?? '',
        clientIp,
      ))
    ) {
      return noStoreJson(
        {
          code: 'human_verification_failed',
          error: '사용자 확인에 실패했습니다.',
        },
        403,
      );
    }
    const abuseKey = await deps.createAbuseKey(clientIp);
    await deps.deleteComment(actor, rawId.toLowerCase(), { abuseKey });
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof CommunityWriteError) {
      return noStoreJson(
        {
          code: error.code,
          error: error.message,
          ...(error.retryAt ? { retryAt: error.retryAt } : {}),
        },
        error.status,
        error.status === 429 && error.retryAfterSeconds
          ? { 'Retry-After': String(error.retryAfterSeconds) }
          : {},
      );
    }
    if (error instanceof CommunityAuthError) {
      return noStoreJson(
        { code: error.code, error: error.message },
        error.status,
      );
    }
    if (error instanceof CommunitySecurityError) {
      return noStoreJson({ code: error.code, error: error.message }, 403);
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
