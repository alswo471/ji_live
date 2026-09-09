import {
  createDailyAbuseKey,
  CommunitySecurityError,
  getTrustedClientIp,
} from '@/lib/community/abuse-key';
import {
  authenticateCommunityUser,
  CommunityAuthError,
} from '@/lib/community/auth';
import { isCommunityEnabled } from '@/lib/community/config';
import {
  getEngagement,
  recordPostView,
  setPostRecommendation,
  CommunityEngagementError,
} from '@/lib/community/engagement-service';
import { isCommunityUuid } from '@/lib/community/read-service';
import { verifyTurnstile } from '@/lib/community/turnstile';

export const dynamic = 'force-dynamic';

type EngagementInput =
  | { action: 'view' }
  | { action: 'recommend'; recommended: boolean };

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

function invalidInput() {
  return noStoreJson(
    { code: 'invalid_engagement', error: '요청 내용을 확인해 주세요.' },
    400,
  );
}

function parseInput(value: unknown): EngagementInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.action === 'view') {
    return input.recommended === undefined ? { action: 'view' } : null;
  }
  if (input.action === 'recommend' && typeof input.recommended === 'boolean') {
    return { action: 'recommend', recommended: input.recommended };
  }
  return null;
}

async function defaultOptionalActor(request: Request) {
  if (!request.headers.has('authorization')) return null;
  try {
    return (await authenticateCommunityUser(request)).id;
  } catch {
    return null;
  }
}

export interface CommunityEngagementRouteDependencies {
  enabled: typeof isCommunityEnabled;
  authenticate: typeof authenticateCommunityUser;
  resolveOptionalActor: (request: Request) => Promise<string | null>;
  resolveClientIp: typeof getTrustedClientIp;
  verifyHuman: typeof verifyTurnstile;
  createAbuseKey: typeof createDailyAbuseKey;
  getEngagement: typeof getEngagement;
  recordPostView: typeof recordPostView;
  setPostRecommendation: typeof setPostRecommendation;
}

const dependencies: CommunityEngagementRouteDependencies = {
  enabled: isCommunityEnabled,
  authenticate: authenticateCommunityUser,
  resolveOptionalActor: defaultOptionalActor,
  resolveClientIp: getTrustedClientIp,
  verifyHuman: verifyTurnstile,
  createAbuseKey: createDailyAbuseKey,
  getEngagement,
  recordPostView,
  setPostRecommendation,
};

function routeError(error: unknown) {
  if (error instanceof CommunityEngagementError) {
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
      code: 'community_engagement_unavailable',
      error: '집계 정보를 불러오지 못했습니다.',
    },
    503,
  );
}

export async function handleGetEngagementRequest(
  request: Request,
  rawId: string,
  deps: CommunityEngagementRouteDependencies = dependencies,
) {
  if (!deps.enabled())
    return noStoreJson({ error: '페이지를 찾을 수 없습니다.' }, 404);
  if (!isCommunityUuid(rawId)) return invalidInput();
  try {
    return noStoreJson(
      await deps.getEngagement(
        rawId.toLowerCase(),
        await deps.resolveOptionalActor(request),
      ),
    );
  } catch (error) {
    return routeError(error);
  }
}

export async function handlePostEngagementRequest(
  request: Request,
  rawId: string,
  deps: CommunityEngagementRouteDependencies = dependencies,
) {
  if (!deps.enabled())
    return noStoreJson({ error: '페이지를 찾을 수 없습니다.' }, 404);
  if (!isCommunityUuid(rawId)) return invalidInput();

  let input: EngagementInput | null;
  try {
    input = parseInput(await request.json());
  } catch {
    return invalidInput();
  }
  if (!input) return invalidInput();

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
    const context = { abuseKey: await deps.createAbuseKey(clientIp) };
    return noStoreJson(
      input.action === 'view'
        ? await deps.recordPostView(actor, rawId.toLowerCase(), context)
        : await deps.setPostRecommendation(
            actor,
            rawId.toLowerCase(),
            input.recommended,
            context,
          ),
    );
  } catch (error) {
    return routeError(error);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id } = await context.params;
  return handleGetEngagementRequest(request, id);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id } = await context.params;
  return handlePostEngagementRequest(request, id);
}
