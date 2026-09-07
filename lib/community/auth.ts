import { getServerSupabase } from './supabase';
import type { CommunityActor } from './types';

type CommunityUserRecord = {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
  [key: string]: unknown;
};

type CommunityUserLookupResult = {
  data: { user: CommunityUserRecord | null };
  error: { message: string } | null;
};

export type CommunityUserLookup = (
  accessToken: string,
) => Promise<CommunityUserLookupResult>;

export class CommunityAuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunityAuthError';
  }
}

const lookupCommunityUser: CommunityUserLookup = async (accessToken) => {
  const result = await getServerSupabase().auth.getUser(accessToken);
  const user = result.data.user;

  return {
    data: {
      user: user
        ? {
            id: user.id,
            email: user.email ?? null,
            is_anonymous: user.is_anonymous,
          }
        : null,
    },
    error: result.error ? { message: result.error.message } : null,
  };
};

export async function authenticateCommunityUser(
  request: Request,
  lookup: CommunityUserLookup = lookupCommunityUser,
): Promise<CommunityActor> {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/.exec(authorization);

  if (!match) {
    throw new CommunityAuthError(
      401,
      'community_auth_required',
      '커뮤니티 인증이 필요합니다.',
    );
  }

  const { data, error } = await lookup(match[1]);
  const user = data.user;

  if (error || !user?.id) {
    throw new CommunityAuthError(
      401,
      'community_auth_invalid',
      '커뮤니티 인증을 확인하지 못했습니다.',
    );
  }

  if (user.is_anonymous !== true) {
    throw new CommunityAuthError(
      403,
      'anonymous_user_required',
      '익명 커뮤니티 계정만 작성할 수 있습니다.',
    );
  }

  return {
    id: user.id,
    isAnonymous: true,
    email: typeof user.email === 'string' ? user.email : null,
  };
}
