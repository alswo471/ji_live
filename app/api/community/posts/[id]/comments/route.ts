import { authenticateCommunityUser } from '@/lib/community/auth';
import { isCommunityEnabled } from '@/lib/community/config';
import {
  listComments,
  CommunityReadInputError,
  isCommunityUuid,
  validateCommunityCursor,
} from '@/lib/community/read-service';

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
