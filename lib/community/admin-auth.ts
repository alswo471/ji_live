import { getServerSupabase } from './supabase';

export type CommunityAdmin = { id: string };

type AdminUserRecord = {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
};

export type CommunityAdminUserLookup = (accessToken: string) => Promise<{
  data: { user: AdminUserRecord | null };
  error: { message: string } | null;
}>;

export type CommunityAdminMembershipLookup = (
  userId: string,
) => Promise<boolean>;

export class CommunityAdminAuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunityAdminAuthError';
  }
}

const lookupAdminUser: CommunityAdminUserLookup = async (accessToken) => {
  const result = await getServerSupabase().auth.getUser(accessToken);
  return {
    data: {
      user: result.data.user
        ? {
            id: result.data.user.id,
            email: result.data.user.email ?? null,
            is_anonymous: result.data.user.is_anonymous,
          }
        : null,
    },
    error: result.error ? { message: result.error.message } : null,
  };
};

const lookupAdminMembership: CommunityAdminMembershipLookup = async (
  userId,
) => {
  const { data, error } = await getServerSupabase()
    .from('community_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('community admin lookup failed');
  return data?.user_id === userId;
};

export async function requireCommunityAdmin(
  request: Request,
  lookupUser: CommunityAdminUserLookup = lookupAdminUser,
  lookupMembership: CommunityAdminMembershipLookup = lookupAdminMembership,
): Promise<CommunityAdmin> {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) {
    throw new CommunityAdminAuthError(
      401,
      'admin_auth_required',
      '관리자 로그인이 필요합니다.',
    );
  }

  const { data, error } = await lookupUser(match[1]);
  const user = data.user;
  if (error || !user?.id) {
    throw new CommunityAdminAuthError(
      401,
      'admin_auth_invalid',
      '관리자 로그인을 확인하지 못했습니다.',
    );
  }
  if (user.is_anonymous === true || !(await lookupMembership(user.id))) {
    throw new CommunityAdminAuthError(
      403,
      'admin_access_denied',
      '관리자 권한이 필요합니다.',
    );
  }
  return { id: user.id };
}
