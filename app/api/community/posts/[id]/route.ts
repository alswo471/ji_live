import { authenticateCommunityUser } from '@/lib/community/auth';
import { isCommunityEnabled } from '@/lib/community/config';
import {
  getPost,
  CommunityReadInputError,
  isCommunityUuid,
} from '@/lib/community/read-service';

export const dynamic = 'force-dynamic';

type PostLoader = typeof getPost;
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
