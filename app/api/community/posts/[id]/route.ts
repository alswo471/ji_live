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
import {
  getPost,
  CommunityReadInputError,
  isCommunityUuid,
} from '@/lib/community/read-service';
import { deletePost, CommunityWriteError } from '@/lib/community/write-service';
import { verifyTurnstile } from '@/lib/community/turnstile';

export const dynamic = 'force-dynamic';

type PostLoader = typeof getPost;
type OptionalActorResolver = (request: Request) => Promise<string | null>;
type CommunityEnabledReader = typeof isCommunityEnabled;

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

const resolveOptionalActor: OptionalActorResolver = async (request) => {
  if (!request.headers.has('authorization')) return null;
  try {
    return (await authenticateCommunityUser(request)).id;
  } catch {
    return null;
  }
};

export async function handleGetPostRequest(
  request: Request,
  rawId: string,
  load: PostLoader = getPost,
  resolveActor: OptionalActorResolver = resolveOptionalActor,
  enabled: CommunityEnabledReader = isCommunityEnabled,
) {
  if (!enabled())
    return noStoreJson({ error: '페이지를 찾을 수 없습니다.' }, 404);
  if (!isCommunityUuid(rawId)) {
    return noStoreJson({ error: '게시글 정보를 확인할 수 없습니다.' }, 400);
  }

  try {
    const result = await load(rawId.toLowerCase(), await resolveActor(request));
    return result
      ? noStoreJson(result)
      : noStoreJson({ error: '게시글을 찾을 수 없습니다.' }, 404);
  } catch (error) {
    if (error instanceof CommunityReadInputError) {
      return noStoreJson({ error: error.message }, 400);
    }
    return noStoreJson(
      { error: '커뮤니티 데이터를 불러오지 못했습니다.' },
      503,
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id } = await context.params;
  return handleGetPostRequest(request, id);
}

export interface CommunityDeletePostRouteDependencies {
  enabled: typeof isCommunityEnabled;
  authenticate: typeof authenticateCommunityUser;
  resolveClientIp: typeof getTrustedClientIp;
  verifyHuman: typeof verifyTurnstile;
  createAbuseKey: typeof createDailyAbuseKey;
  deletePost: typeof deletePost;
}

const deleteDependencies: CommunityDeletePostRouteDependencies = {
  enabled: isCommunityEnabled,
  authenticate: authenticateCommunityUser,
  resolveClientIp: getTrustedClientIp,
  verifyHuman: verifyTurnstile,
  createAbuseKey: createDailyAbuseKey,
  deletePost,
};

export async function handleDeletePostRequest(
  request: Request,
  rawId: string,
  dependencies: CommunityDeletePostRouteDependencies = deleteDependencies,
) {
  if (!dependencies.enabled()) {
    return noStoreJson({ error: '페이지를 찾을 수 없습니다.' }, 404);
  }
  if (!isCommunityUuid(rawId)) {
    return noStoreJson(
      { code: 'invalid_post_id', error: '게시글 정보를 확인할 수 없습니다.' },
      400,
    );
  }

  try {
    const actor = await dependencies.authenticate(request);
    const clientIp = dependencies.resolveClientIp(request);
    if (
      !(await dependencies.verifyHuman(
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
    const abuseKey = await dependencies.createAbuseKey(clientIp);
    await dependencies.deletePost(actor, rawId.toLowerCase(), { abuseKey });
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
  return handleDeletePostRequest(request, id);
}
