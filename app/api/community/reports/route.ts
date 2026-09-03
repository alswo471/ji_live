import {
  createDailyAbuseKey,
  CommunitySecurityError,
} from '@/lib/community/abuse-key';
import {
  authenticateCommunityUser,
  CommunityAuthError,
} from '@/lib/community/auth';
import { isCommunityEnabled } from '@/lib/community/config';
import { verifyTurnstile } from '@/lib/community/turnstile';
import {
  CommunityInputError,
  validateReportInput,
} from '@/lib/community/validation';
import {
  reportContent,
  CommunityWriteError,
} from '@/lib/community/write-service';

export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export interface CommunityReportRouteDependencies {
  enabled: typeof isCommunityEnabled;
  authenticate: typeof authenticateCommunityUser;
  verifyHuman: typeof verifyTurnstile;
  createAbuseKey: typeof createDailyAbuseKey;
  reportContent: typeof reportContent;
}

const dependencies: CommunityReportRouteDependencies = {
  enabled: isCommunityEnabled,
  authenticate: authenticateCommunityUser,
  verifyHuman: verifyTurnstile,
  createAbuseKey: createDailyAbuseKey,
  reportContent,
};

export async function handleReportRequest(
  request: Request,
  deps: CommunityReportRouteDependencies = dependencies,
) {
  if (!deps.enabled())
    return noStoreJson({ error: '페이지를 찾을 수 없습니다.' }, 404);

  try {
    const actor = await deps.authenticate(request);
    const clientIp = request.headers.get('cf-connecting-ip') ?? '';
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
    const input = validateReportInput(await request.json());
    return noStoreJson(
      await deps.reportContent(actor, input, { abuseKey }),
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
  return handleReportRequest(request);
}
