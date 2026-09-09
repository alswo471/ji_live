import { getServerSupabase } from './supabase';
import {
  CommunityRepositoryError,
  type CommunityCommentRecord,
  type CommunityPageQuery,
} from './repository';

// Only an absent exact RPC is a deployment capability gap. Never mask outages or denied grants.
export function isMissingCommentRpc(
  error: { code?: string; message?: string } | null,
  name: string,
) {
  return (
    !!error &&
    ['PGRST202', '42883'].includes(error.code ?? '') &&
    new RegExp(`(?:public\\.)?${name}\\s*\\(`).test(error.message ?? '')
  );
}

export async function findCommentThreads(
  postId: string,
  parentCommentId: string | null,
  query: CommunityPageQuery,
  legacy: () => Promise<CommunityCommentRecord[]>,
) {
  const { data, error } = await getServerSupabase().rpc(
    'read_community_comments',
    {
      p_post_id: postId,
      p_parent_comment_id: parentCommentId,
      p_before_created_at: query.cursor?.createdAt ?? null,
      p_before_id: query.cursor?.id ?? null,
      p_limit: query.limit,
    },
  );
  if (
    isMissingCommentRpc(error, 'read_community_comments') &&
    !parentCommentId
  ) {
    return { items: await legacy(), repliesEnabled: false };
  }
  if (error || !Array.isArray(data)) throw new CommunityRepositoryError();
  const items: CommunityCommentRecord[] = data.map(
    (row: Record<string, unknown>) => {
      if (
        !row ||
        typeof row !== 'object' ||
        !['id', 'post_id', 'author_name', 'body', 'created_at'].every(
          (key) => typeof row[key] === 'string',
        ) ||
        !['visible', 'hidden', 'deleted'].includes(String(row.status)) ||
        typeof row.unavailable !== 'boolean' ||
        !Number.isSafeInteger(row.reply_count) ||
        Number(row.reply_count) < 0 ||
        (row.parent_comment_id !== null &&
          typeof row.parent_comment_id !== 'string') ||
        (row.author_id !== null && typeof row.author_id !== 'string')
      )
        throw new CommunityRepositoryError();
      return {
        id: row.id as string,
        postId: row.post_id as string,
        authorId: (row.author_id as string | null) ?? '',
        authorName: row.author_name as string,
        body: row.body as string,
        createdAt: row.created_at as string,
        status: row.status as CommunityCommentRecord['status'],
        parentStatus: 'visible',
        parentCommentId: row.parent_comment_id as string | null,
        replyCount: Number(row.reply_count),
        unavailable: row.unavailable,
      };
    },
  );
  return { items, repliesEnabled: true };
}
