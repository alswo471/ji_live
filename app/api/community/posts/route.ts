import { isCommunityEnabled } from '@/lib/community/config';
import {
  listPosts,
  CommunityReadInputError,
  validateCommunityCursor,
} from '@/lib/community/read-service';

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
