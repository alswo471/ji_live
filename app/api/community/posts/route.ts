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
  listPosts,
  CommunityReadInputError,
  validateCommunityCursor,
} from '@/lib/community/read-service';
import { verifyTurnstile } from '@/lib/community/turnstile';
import {
  CommunityInputError,
  validatePostInput,
} from '@/lib/community/validation';
import { createPost, CommunityWriteError } from '@/lib/community/write-service';

export const dynamic = 'force-dynamic';

type PostPageLoader = typeof listPosts;
type CommunityEnabledReader = typeof isCommunityEnabled;

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function getRequestedLimit(value: string | null) {
  if (value === null) return 20;
  if (!/^[0-9]+$/.test(value)) {
    throw new CommunityReadInputError(
      'invalid_limit',
      '페이지 크기를 확인할 수 없습니다.',
    );
  }
  return Number(value);
}

export async function handleListPostsRequest(
  request: Request,
  load: PostPageLoader = listPosts,
  enabled: CommunityEnabledReader = isCommunityEnabled,
) {
  if (!enabled())
    return noStoreJson({ error: '페이지를 찾을 수 없습니다.' }, 404);

  try {
    const search = new URL(request.url).searchParams;
    const cursor = search.get('cursor');
    validateCommunityCursor(cursor);
    const result = await load(cursor, getRequestedLimit(search.get('limit')));
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

export async function GET(request: Request) {
  return handleListPostsRequest(request);
}

export interface CommunityWriteRouteDependencies {
  enabled: typeof isCommunityEnabled;
  authenticate: typeof authenticateCommunityUser;
  verifyHuman: typeof verifyTurnstile;
  createAbuseKey: typeof createDailyAbuseKey;
  createPost: typeof createPost;
}

const writeDependencies: CommunityWriteRouteDependencies = {
  enabled: isCommunityEnabled,
  authenticate: authenticateCommunityUser,
  verifyHuman: verifyTurnstile,
  createAbuseKey: createDailyAbuseKey,
  createPost,
};

export async function handleCreatePostRequest(
  request: Request,
  dependencies: CommunityWriteRouteDependencies = writeDependencies,
) {
  if (!dependencies.enabled()) {
    return noStoreJson({ error: '페이지를 찾을 수 없습니다.' }, 404);
  }

  try {
    const actor = await dependencies.authenticate(request);
    const clientIp = request.headers.get('cf-connecting-ip') ?? '';
    const human = await dependencies.verifyHuman(
      request.headers.get('x-turnstile-token') ?? '',
      clientIp,
    );
    if (!human) {
      return noStoreJson(
        {
          code: 'human_verification_failed',
          error: '사용자 확인에 실패했습니다.',
        },
        403,
      );
    }

    const abuseKey = await dependencies.createAbuseKey(clientIp);
    const input = validatePostInput(await request.json());
    return noStoreJson(
      await dependencies.createPost(actor, input, { abuseKey }),
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

export async function POST(request: Request) {
  return handleCreatePostRequest(request);
}
