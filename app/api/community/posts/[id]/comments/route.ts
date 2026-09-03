import {
  createDailyAbuseKey,
  CommunitySecurityError,
} from '@/lib/community/abuse-key';
import {
  authenticateCommunityUser,
  CommunityAuthError,
} from '@/lib/community/auth';
import { isCommunityEnabled } from '@/lib/community/config';
import {
  listComments,
  CommunityReadInputError,
  isCommunityUuid,
  validateCommunityCursor,
} from '@/lib/community/read-service';
import { verifyTurnstile } from '@/lib/community/turnstile';
import {
  CommunityInputError,
  validateCommentInput,
} from '@/lib/community/validation';
import {
  createComment,
  CommunityWriteError,
} from '@/lib/community/write-service';

export const dynamic = 'force-dynamic';

type CommentPageLoader = typeof listComments;
type OptionalActorResolver = (request: Request) => Promise<string | null>;
type CommunityEnabledReader = typeof isCommunityEnabled;

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
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

function getRequestedLimit(value: string | null) {
  if (value === null) return 30;
  if (!/^[0-9]+$/.test(value)) {
    throw new CommunityReadInputError(
      'invalid_limit',
      '페이지 크기를 확인할 수 없습니다.',
    );
  }
  return Number(value);
}

export async function handleListCommentsRequest(
  request: Request,
  rawPostId: string,
  load: CommentPageLoader = listComments,
  resolveActor: OptionalActorResolver = resolveOptionalActor,
  enabled: CommunityEnabledReader = isCommunityEnabled,
) {
  if (!enabled())
    return noStoreJson({ error: '페이지를 찾을 수 없습니다.' }, 404);
  if (!isCommunityUuid(rawPostId)) {
    return noStoreJson({ error: '게시글 정보를 확인할 수 없습니다.' }, 400);
  }

  try {
    const search = new URL(request.url).searchParams;
    const cursor = search.get('cursor');
    validateCommunityCursor(cursor);
    const result = await load(
      rawPostId.toLowerCase(),
      cursor,
      getRequestedLimit(search.get('limit')),
      await resolveActor(request),
    );
    return noStoreJson(result);
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
  return handleListCommentsRequest(request, id);
}

export interface CommunityCommentWriteRouteDependencies {
  enabled: typeof isCommunityEnabled;
  authenticate: typeof authenticateCommunityUser;
  verifyHuman: typeof verifyTurnstile;
  createAbuseKey: typeof createDailyAbuseKey;
  createComment: typeof createComment;
}

const writeDependencies: CommunityCommentWriteRouteDependencies = {
  enabled: isCommunityEnabled,
  authenticate: authenticateCommunityUser,
  verifyHuman: verifyTurnstile,
  createAbuseKey: createDailyAbuseKey,
  createComment,
};

export async function handleCreateCommentRequest(
  request: Request,
  rawPostId: string,
  dependencies: CommunityCommentWriteRouteDependencies = writeDependencies,
) {
  if (!dependencies.enabled()) {
    return noStoreJson({ error: '페이지를 찾을 수 없습니다.' }, 404);
  }
  if (!isCommunityUuid(rawPostId)) {
    return noStoreJson(
      { code: 'invalid_post_id', error: '게시글 정보를 확인할 수 없습니다.' },
      400,
    );
  }

  try {
    const actor = await dependencies.authenticate(request);
    const clientIp = request.headers.get('cf-connecting-ip') ?? '';
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
    const input = validateCommentInput(await request.json());
    return noStoreJson(
      await dependencies.createComment(actor, rawPostId.toLowerCase(), input, {
        abuseKey,
      }),
      201,
    );
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
    if (error instanceof CommunityInputError) {
      return noStoreJson({ code: error.code, error: error.message }, 400);
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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id } = await context.params;
  return handleCreateCommentRequest(request, id);
}
