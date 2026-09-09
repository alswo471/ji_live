import { getServerSupabase } from './supabase';
import type { CommunityActor, CommunityEngagement } from './types';

type EngagementAction = 'view' | 'recommend';

export interface CommunityEngagementContext {
  abuseKey: string;
}

export interface CommunityEngagementRateLimitRequest {
  actorId: string;
  abuseKey: string;
  action: EngagementAction;
  limit: number;
  windowSeconds: number;
}

export interface CommunityEngagementRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  retryAt: string | null;
}

export interface CommunityEngagementRepository {
  getEngagement(
    postId: string,
    actorId: string | null,
  ): Promise<CommunityEngagement>;
  consumeRateLimit(
    request: CommunityEngagementRateLimitRequest,
  ): Promise<CommunityEngagementRateLimitResult>;
  recordView(postId: string, actorId: string): Promise<CommunityEngagement>;
  setRecommendation(
    postId: string,
    actorId: string,
    recommended: boolean,
  ): Promise<CommunityEngagement>;
}

export class CommunityEngagementError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly retryAt?: string | null,
  ) {
    super(message);
    this.name = 'CommunityEngagementError';
  }
}

function unavailable(): never {
  throw new CommunityEngagementError(
    503,
    'community_engagement_unavailable',
    '집계 정보를 처리하지 못했습니다.',
  );
}

function providerError(error?: { code?: string } | null): never {
  if (error?.code === 'P0002') {
    throw new CommunityEngagementError(
      404,
      'community_post_not_found',
      '게시글을 찾을 수 없습니다.',
    );
  }
  if (error?.code === '42501') {
    throw new CommunityEngagementError(
      403,
      'community_engagement_forbidden',
      '이 작업을 할 수 없습니다.',
    );
  }
  return unavailable();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    unavailable();
  return value as Record<string, unknown>;
}

function counter(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    unavailable();
  }
  return value;
}

function engagement(value: unknown): CommunityEngagement {
  const row = asRecord(value);
  if (
    typeof row.recommended !== 'boolean' ||
    typeof row.canRecommend !== 'boolean'
  ) {
    unavailable();
  }
  return {
    viewCount: counter(row, 'viewCount'),
    recommendationCount: counter(row, 'recommendationCount'),
    recommended: row.recommended,
    canRecommend: row.canRecommend,
  };
}

function rateDecision(value: unknown): CommunityEngagementRateLimitResult {
  const row = asRecord(value);
  const { allowed, retryAfterSeconds, retryAt } = row;
  if (
    typeof allowed !== 'boolean' ||
    typeof retryAfterSeconds !== 'number' ||
    !Number.isInteger(retryAfterSeconds) ||
    retryAfterSeconds < 0 ||
    (retryAt !== null &&
      (typeof retryAt !== 'string' || Number.isNaN(Date.parse(retryAt)))) ||
    (allowed && (retryAfterSeconds !== 0 || retryAt !== null)) ||
    (!allowed && (retryAfterSeconds < 1 || typeof retryAt !== 'string'))
  ) {
    unavailable();
  }
  return { allowed, retryAfterSeconds, retryAt };
}

async function loadPost(postId: string) {
  const { data, error } = await getServerSupabase()
    .from('community_posts')
    .select('id,author_id,status,view_count,recommendation_count')
    .eq('id', postId)
    .eq('status', 'visible')
    .maybeSingle();
  if (error) providerError(error);
  if (!data) providerError({ code: 'P0002' });
  return asRecord(data);
}

export const communityEngagementRepository: CommunityEngagementRepository = {
  async getEngagement(postId, actorId) {
    const post = await loadPost(postId);
    let recommended = false;
    let restricted = false;
    if (actorId) {
      const client = getServerSupabase();
      const [
        { data: recommendation, error: recommendationError },
        { data: sanction, error: sanctionError },
      ] = await Promise.all([
        client
          .from('community_post_recommendations')
          .select('post_id')
          .eq('post_id', postId)
          .eq('actor_id', actorId)
          .maybeSingle(),
        client
          .from('community_sanctions')
          .select('id')
          .eq('user_id', actorId)
          .is('revoked_at', null)
          .gt('ends_at', new Date().toISOString())
          .limit(1)
          .maybeSingle(),
      ]);
      if (recommendationError) providerError(recommendationError);
      if (sanctionError) providerError(sanctionError);
      recommended = Boolean(recommendation);
      restricted = Boolean(sanction);
    }
    return engagement({
      viewCount: post.view_count,
      recommendationCount: post.recommendation_count,
      recommended,
      canRecommend:
        Boolean(actorId) && post.author_id !== actorId && !restricted,
    });
  },

  async consumeRateLimit(request) {
    const { data, error } = await getServerSupabase().rpc(
      'consume_community_rate_limit',
      {
        p_actor_id: request.actorId,
        p_abuse_key: request.abuseKey,
        p_action: request.action,
        p_limit: request.limit,
        p_window_seconds: request.windowSeconds,
      },
    );
    if (error) providerError(error);
    return rateDecision(data);
  },

  async recordView(postId, actorId) {
    const { data, error } = await getServerSupabase().rpc(
      'record_community_post_view',
      { p_post_id: postId, p_actor_id: actorId },
    );
    if (error) providerError(error);
    return engagement(data);
  },

  async setRecommendation(postId, actorId, recommended) {
    const { data, error } = await getServerSupabase().rpc(
      'set_community_post_recommendation',
      {
        p_post_id: postId,
        p_actor_id: actorId,
        p_recommended: recommended,
      },
    );
    if (error) providerError(error);
    return engagement(data);
  },
};

async function consume(
  actor: CommunityActor,
  context: CommunityEngagementContext,
  action: EngagementAction,
  limit: number,
  repository: CommunityEngagementRepository,
) {
  const result = await repository.consumeRateLimit({
    actorId: actor.id,
    abuseKey: context.abuseKey,
    action,
    limit,
    windowSeconds: 60,
  });
  if (!result.allowed) {
    throw new CommunityEngagementError(
      429,
      'community_engagement_rate_limited',
      '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      result.retryAfterSeconds,
      result.retryAt,
    );
  }
}

export async function getEngagement(
  postId: string,
  actorId: string | null,
  repository: CommunityEngagementRepository = communityEngagementRepository,
) {
  return engagement(await repository.getEngagement(postId, actorId));
}

export async function recordPostView(
  actor: CommunityActor,
  postId: string,
  context: CommunityEngagementContext,
  repository: CommunityEngagementRepository = communityEngagementRepository,
) {
  await consume(actor, context, 'view', 60, repository);
  return engagement(await repository.recordView(postId, actor.id));
}

export async function setPostRecommendation(
  actor: CommunityActor,
  postId: string,
  recommended: boolean,
  context: CommunityEngagementContext,
  repository: CommunityEngagementRepository = communityEngagementRepository,
) {
  await consume(actor, context, 'recommend', 20, repository);
  return engagement(
    await repository.setRecommendation(postId, actor.id, recommended),
  );
}
