import { createHmac } from 'node:crypto';

export class CommunityAdminActorLabelError extends Error {
  readonly status = 503;
  readonly code = 'admin_actor_label_unavailable';

  constructor() {
    super('관리자 사용자 정보를 표시하지 못했습니다.');
    this.name = 'CommunityAdminActorLabelError';
  }
}

export function createAdminActorLabel(
  userId: string,
  secret: string | undefined = process.env.COMMUNITY_HMAC_SECRET,
) {
  if (!secret || Array.from(secret).length < 32) {
    throw new CommunityAdminActorLabelError();
  }

  const suffix = createHmac('sha256', secret)
    .update(`admin-label:${userId}`)
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();
  return `익명 사용자 #${suffix}`;
}
