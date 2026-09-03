import {
  CommunityAdminAuthError,
  requireCommunityAdmin,
  type CommunityAdmin,
} from '@/lib/community/admin-auth';
import { isCommunityEnabled } from '@/lib/community/config';
import {
  CommunityModerationError,
  moderateContent,
} from '@/lib/community/moderation-service';

export const dynamic = 'force-dynamic';

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export interface CommunityAdminActionsDependencies {
  enabled: () => boolean;
  requireAdmin: (request: Request) => Promise<CommunityAdmin>;
  moderate: (admin: CommunityAdmin, input: unknown) => Promise<void>;
}

const dependencies: CommunityAdminActionsDependencies = {
  enabled: isCommunityEnabled,
  requireAdmin: requireCommunityAdmin,
  moderate: moderateContent,
};

export async function handleModerationActionRequest(
  request: Request,
  deps: CommunityAdminActionsDependencies = dependencies,
) {
  if (!deps.enabled())
    return json({ error: '페이지를 찾을 수 없습니다.' }, 404);
  try {
    const admin = await deps.requireAdmin(request);
    await deps.moderate(admin, await request.json());
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (
      error instanceof CommunityAdminAuthError ||
      error instanceof CommunityModerationError
    ) {
      return json({ code: error.code, error: error.message }, error.status);
    }
    return json(
      {
        code: 'moderation_unavailable',
        error: '관리 요청을 처리하지 못했습니다.',
      },
      503,
    );
  }
}

export async function POST(request: Request) {
  return handleModerationActionRequest(request);
}
