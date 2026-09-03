import {
  CommunityAdminAuthError,
  requireCommunityAdmin,
  type CommunityAdmin,
} from '@/lib/community/admin-auth';
import { isCommunityEnabled } from '@/lib/community/config';
import {
  CommunityModerationError,
  listModerationQueue,
} from '@/lib/community/moderation-service';
import { CommunityReadInputError } from '@/lib/community/read-service';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export interface CommunityAdminReportsDependencies {
  enabled: () => boolean;
  requireAdmin: (request: Request) => Promise<CommunityAdmin>;
  listQueue: (cursor: string | null) => Promise<unknown>;
}

const dependencies: CommunityAdminReportsDependencies = {
  enabled: isCommunityEnabled,
  requireAdmin: requireCommunityAdmin,
  listQueue: listModerationQueue,
};

export async function handleListModerationReportsRequest(
  request: Request,
  deps: CommunityAdminReportsDependencies = dependencies,
) {
  if (!deps.enabled())
    return json({ error: '페이지를 찾을 수 없습니다.' }, 404);
  try {
    await deps.requireAdmin(request);
    const cursor = new URL(request.url).searchParams.get('cursor');
    return json(await deps.listQueue(cursor));
  } catch (error) {
    if (
      error instanceof CommunityAdminAuthError ||
      error instanceof CommunityModerationError
    ) {
      return json({ code: error.code, error: error.message }, error.status);
    }
    if (error instanceof CommunityReadInputError) {
      return json({ code: error.code, error: error.message }, 400);
    }
    return json(
      {
        code: 'moderation_unavailable',
        error: '관리 화면을 불러오지 못했습니다.',
      },
      503,
    );
  }
}

export async function GET(request: Request) {
  return handleListModerationReportsRequest(request);
}
