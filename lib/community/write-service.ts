import { createAnonymousName } from './nickname';
import {
  type CommunityCommentRecord,
  type CommunityContentStatus,
  type CommunityPostRecord,
} from './repository';
import { getServerSupabase } from './supabase';
import type {
  CommentInput,
  CommunityActor,
  CommunityComment,
  CommunityPostDetail,
  PostInput,
  ReportInput,
  ReportReceipt,
} from './types';

type WriteAction = 'post' | 'comment' | 'report';

export interface CommunityWriteContext {
  abuseKey: string;
}

export interface CommunityRateLimitRequest {
  actorId: string;
  abuseKey: string;
  action: WriteAction;
  limit: number;
  windowSeconds: number;
}

export interface CommunityOwnership {
  id: string;
  authorId: string;
  status: CommunityContentStatus;
}

export interface CommunityWriteRepository {
  isRestricted(actorId: string): Promise<boolean>;
  findPostByIdempotency(
    actorId: string,
    key: string,
  ): Promise<CommunityPostRecord | null>;
  findCommentByIdempotency(
    actorId: string,
    key: string,
  ): Promise<CommunityCommentRecord | null>;
  consumeRateLimit(request: CommunityRateLimitRequest): Promise<boolean>;
  getOrCreateProfileName(
    actorId: string,
    proposedName: string,
  ): Promise<string>;
  insertPost(input: {
    actorId: string;
    authorName: string;
    input: PostInput;
  }): Promise<CommunityPostRecord>;
  insertComment(input: {
    actorId: string;
    authorName: string;
    postId: string;
    input: CommentInput;
  }): Promise<CommunityCommentRecord>;
  findPostOwnership(id: string): Promise<CommunityOwnership | null>;
  findCommentOwnership(id: string): Promise<CommunityOwnership | null>;
  softDeletePost(id: string): Promise<void>;
  softDeleteComment(id: string): Promise<void>;
  submitReport(input: {
    actorId: string;
    abuseKey: string;
    input: ReportInput;
  }): Promise<ReportReceipt>;
}

export class CommunityWriteError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunityWriteError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CommunityWriteError(
      503,
      'community_write_unavailable',
      '커뮤니티 요청을 처리하지 못했습니다.',
    );
  }
  return value as Record<string, unknown>;
}

function string(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new CommunityWriteError(
      503,
      'community_write_unavailable',
      '커뮤니티 요청을 처리하지 못했습니다.',
    );
  }
  return value;
}

function nullableString(row: Record<string, unknown>, key: string) {
  return row[key] === null ? null : string(row, key);
}

function status(row: Record<string, unknown>): CommunityContentStatus {
  const value = string(row, 'status');
  if (value !== 'visible' && value !== 'hidden' && value !== 'deleted') {
    throw new CommunityWriteError(
      503,
      'community_write_unavailable',
      '커뮤니티 요청을 처리하지 못했습니다.',
    );
  }
  return value;
}

function postRecord(value: unknown): CommunityPostRecord {
  const row = record(value);
  return {
    id: string(row, 'id'),
    authorId: string(row, 'author_id'),
    authorName: string(row, 'author_name'),
    title: string(row, 'title'),
    body: string(row, 'body'),
    linkUrl: nullableString(row, 'link_url'),
    status: status(row),
    createdAt: string(row, 'created_at'),
    commentCount: 0,
  };
}

function commentRecord(value: unknown): CommunityCommentRecord {
  const row = record(value);
  return {
    id: string(row, 'id'),
    postId: string(row, 'post_id'),
    authorId: string(row, 'author_id'),
    authorName: string(row, 'author_name'),
    body: string(row, 'body'),
    status: status(row),
    parentStatus: 'visible',
    createdAt: string(row, 'created_at'),
  };
}

function providerError(
  error?: { code?: string; message?: string } | null,
): never {
  if (error?.code === '23505') {
    throw new CommunityWriteError(
      409,
      'duplicate_request',
      '이미 처리된 요청입니다.',
    );
  }
  if (error?.code === '23503' || error?.code === 'P0002') {
    throw new CommunityWriteError(
      404,
      'community_content_not_found',
      '커뮤니티 콘텐츠를 찾을 수 없습니다.',
    );
  }
  throw new CommunityWriteError(
    503,
    'community_write_unavailable',
    '커뮤니티 요청을 처리하지 못했습니다.',
  );
}

const POST_COLUMNS =
  'id,author_id,author_name,title,body,link_url,status,created_at';
const COMMENT_COLUMNS =
  'id,post_id,author_id,author_name,body,status,created_at';

export const communityWriteRepository: CommunityWriteRepository = {
  async isRestricted(actorId) {
    const { data, error } = await getServerSupabase()
      .from('community_sanctions')
      .select('id')
      .eq('user_id', actorId)
      .is('revoked_at', null)
      .gt('ends_at', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (error) providerError(error);
    return Boolean(data);
  },

  async findPostByIdempotency(actorId, key) {
    const { data, error } = await getServerSupabase()
      .from('community_posts')
      .select(POST_COLUMNS)
      .eq('author_id', actorId)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (error) providerError(error);
    return data ? postRecord(data) : null;
  },

  async findCommentByIdempotency(actorId, key) {
    const { data, error } = await getServerSupabase()
      .from('community_comments')
      .select(COMMENT_COLUMNS)
      .eq('author_id', actorId)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (error) providerError(error);
    return data ? commentRecord(data) : null;
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
    if (error || typeof data !== 'boolean') providerError(error);
    return data;
  },

  async getOrCreateProfileName(actorId, proposedName) {
    const client = getServerSupabase();
    const { error: insertError } = await client
      .from('community_profiles')
      .upsert(
        { user_id: actorId, display_name: proposedName },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
    if (insertError) providerError(insertError);

    const { data, error } = await client
      .from('community_profiles')
      .select('display_name')
      .eq('user_id', actorId)
      .single();
    if (error || !data) providerError(error);
    return string(record(data), 'display_name');
  },

  async insertPost({ actorId, authorName, input }) {
    const { data, error } = await getServerSupabase()
      .from('community_posts')
      .insert({
        author_id: actorId,
        author_name: authorName,
        title: input.title,
        body: input.body,
        link_url: input.linkUrl,
        idempotency_key: input.idempotencyKey,
      })
      .select(POST_COLUMNS)
      .single();
    if (error || !data) providerError(error);
    return postRecord(data);
  },

  async insertComment({ actorId, authorName, postId, input }) {
    const client = getServerSupabase();
    const { data: parent, error: parentError } = await client
      .from('community_posts')
      .select('id')
      .eq('id', postId)
      .eq('status', 'visible')
      .maybeSingle();
    if (parentError) providerError(parentError);
    if (!parent) providerError({ code: 'P0002' });

    const { data, error } = await client
      .from('community_comments')
      .insert({
        post_id: postId,
        author_id: actorId,
        author_name: authorName,
        body: input.body,
        idempotency_key: input.idempotencyKey,
      })
      .select(COMMENT_COLUMNS)
      .single();
    if (error || !data) providerError(error);
    return commentRecord(data);
  },

  async findPostOwnership(id) {
    const { data, error } = await getServerSupabase()
      .from('community_posts')
      .select('id,author_id,status')
      .eq('id', id)
      .maybeSingle();
    if (error) providerError(error);
    if (!data) return null;
    const row = record(data);
    return {
      id: string(row, 'id'),
      authorId: string(row, 'author_id'),
      status: status(row),
    };
  },

  async findCommentOwnership(id) {
    const { data, error } = await getServerSupabase()
      .from('community_comments')
      .select('id,author_id,status')
      .eq('id', id)
      .maybeSingle();
    if (error) providerError(error);
    if (!data) return null;
    const row = record(data);
    return {
      id: string(row, 'id'),
      authorId: string(row, 'author_id'),
      status: status(row),
    };
  },

  async softDeletePost(id) {
    const { error } = await getServerSupabase()
      .from('community_posts')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) providerError(error);
  },

  async softDeleteComment(id) {
    const { error } = await getServerSupabase()
      .from('community_comments')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) providerError(error);
  },

  async submitReport({ actorId, abuseKey, input }) {
    const { data, error } = await getServerSupabase().rpc(
      'submit_community_report',
      {
        p_reporter_id: actorId,
        p_reporter_abuse_key: abuseKey,
        p_target_type: input.targetType,
        p_target_id: input.targetId,
        p_reason: input.reason,
        p_detail: input.detail,
      },
    );
    if (error) {
      if (error.code === '23505') {
        throw new CommunityWriteError(
          409,
          'duplicate_report',
          '이미 신고한 콘텐츠입니다.',
        );
      }
      providerError(error);
    }
    const result = record(data);
    if (
      result.accepted !== true ||
      typeof result.temporarilyHidden !== 'boolean'
    ) {
      providerError();
    }
    return { accepted: true, temporarilyHidden: result.temporarilyHidden };
  },
};

function toPost(post: CommunityPostRecord): CommunityPostDetail {
  return {
    id: post.id,
    authorName: post.authorName,
    title: post.title,
    body: post.body,
    linkUrl: post.linkUrl,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
    canDelete: true,
  };
}

function toComment(comment: CommunityCommentRecord): CommunityComment {
  return {
    id: comment.id,
    postId: comment.postId,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt,
    canDelete: true,
  };
}

async function consume(
  actor: CommunityActor,
  context: CommunityWriteContext,
  action: WriteAction,
  limit: number,
  windowSeconds: number,
  repository: CommunityWriteRepository,
) {
  const allowed = await repository.consumeRateLimit({
    actorId: actor.id,
    abuseKey: context.abuseKey,
    action,
    limit,
    windowSeconds,
  });
  if (!allowed) {
    throw new CommunityWriteError(
      429,
      'community_rate_limited',
      '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
}

async function ensureCanWrite(
  actor: CommunityActor,
  repository: CommunityWriteRepository,
) {
  if (await repository.isRestricted(actor.id)) {
    throw new CommunityWriteError(
      403,
      'community_write_restricted',
      '운영정책 위반으로 작성이 일시 제한되었습니다.',
    );
  }
}

export async function createPost(
  actor: CommunityActor,
  input: PostInput,
  context: CommunityWriteContext,
  repository: CommunityWriteRepository = communityWriteRepository,
  nameFactory: (actorId: string) => Promise<string> = createAnonymousName,
) {
  const existing = await repository.findPostByIdempotency(
    actor.id,
    input.idempotencyKey,
  );
  if (existing) return toPost(existing);

  await ensureCanWrite(actor, repository);
  await consume(actor, context, 'post', 3, 600, repository);
  const authorName = await repository.getOrCreateProfileName(
    actor.id,
    await nameFactory(actor.id),
  );
  return toPost(
    await repository.insertPost({ actorId: actor.id, authorName, input }),
  );
}

export async function createComment(
  actor: CommunityActor,
  postId: string,
  input: CommentInput,
  context: CommunityWriteContext,
  repository: CommunityWriteRepository = communityWriteRepository,
  nameFactory: (actorId: string) => Promise<string> = createAnonymousName,
) {
  const existing = await repository.findCommentByIdempotency(
    actor.id,
    input.idempotencyKey,
  );
  if (existing) return toComment(existing);

  await ensureCanWrite(actor, repository);
  await consume(actor, context, 'comment', 10, 600, repository);
  const authorName = await repository.getOrCreateProfileName(
    actor.id,
    await nameFactory(actor.id),
  );
  return toComment(
    await repository.insertComment({
      actorId: actor.id,
      authorName,
      postId,
      input,
    }),
  );
}

async function deleteOwned(
  actor: CommunityActor,
  id: string,
  find: (id: string) => Promise<CommunityOwnership | null>,
  remove: (id: string) => Promise<void>,
) {
  const content = await find(id);
  if (!content || content.status === 'deleted') {
    throw new CommunityWriteError(
      404,
      'community_content_not_found',
      '커뮤니티 콘텐츠를 찾을 수 없습니다.',
    );
  }
  if (content.authorId !== actor.id) {
    throw new CommunityWriteError(
      403,
      'community_not_owner',
      '작성자만 삭제할 수 있습니다.',
    );
  }
  await remove(id);
}

export async function deletePost(
  actor: CommunityActor,
  id: string,
  repository: CommunityWriteRepository = communityWriteRepository,
) {
  await deleteOwned(
    actor,
    id,
    (targetId) => repository.findPostOwnership(targetId),
    (targetId) => repository.softDeletePost(targetId),
  );
}

export async function deleteComment(
  actor: CommunityActor,
  id: string,
  repository: CommunityWriteRepository = communityWriteRepository,
) {
  await deleteOwned(
    actor,
    id,
    (targetId) => repository.findCommentOwnership(targetId),
    (targetId) => repository.softDeleteComment(targetId),
  );
}

export async function reportContent(
  actor: CommunityActor,
  input: ReportInput,
  context: CommunityWriteContext,
  repository: CommunityWriteRepository = communityWriteRepository,
) {
  await consume(actor, context, 'report', 10, 3600, repository);
  return repository.submitReport({
    actorId: actor.id,
    abuseKey: context.abuseKey,
    input,
  });
}
