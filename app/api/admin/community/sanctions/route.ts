import {
  CommunityAdminAuthError,
  requireCommunityAdmin,
  type CommunityAdmin,
} from '@/lib/community/admin-auth';
import {
  CommunityAdminConsoleError,
  listAdminSanctions,
} from '@/lib/community/admin-console-service';
import { isCommunityEnabled } from '@/lib/community/config';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function mapAdminError(error: unknown) {
  if (error instanceof CommunityAdminAuthError) {
    return json({ code: error.code, error: error.message }, error.status);
  }
  if (
    error instanceof CommunityAdminConsoleError &&
    (error.status === 400 || error.status === 404 || error.status === 409)
  ) {
    return json({ code: error.code, error: error.message }, error.status);
  }
  return json(
    {
      code: 'admin_console_unavailable',
      error: '관리자 정보를 불러오지 못했습니다.',
    },
    503,
  );
}

export interface CommunityAdminSanctionsDependencies {
  enabled: () => boolean;
  requireAdmin: (request: Request) => Promise<CommunityAdmin>;
  listSanctions: (input: unknown) => Promise<unknown>;
}

const dependencies: CommunityAdminSanctionsDependencies = {
  enabled: isCommunityEnabled,
  requireAdmin: requireCommunityAdmin,
  listSanctions: listAdminSanctions,
};

export async function handleAdminSanctionsRequest(
  request: Request,
  deps: CommunityAdminSanctionsDependencies = dependencies,
) {
  if (!deps.enabled()) {
    return json({ error: '페이지를 찾을 수 없습니다.' }, 404);
  }
  try {
    await deps.requireAdmin(request);
    const searchParams = new URL(request.url).searchParams;
    return json(
      await deps.listSanctions({
        state: searchParams.get('state'),
        cursor: searchParams.get('cursor'),
      }),
    );
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function GET(request: Request) {
  return handleAdminSanctionsRequest(request);
}
