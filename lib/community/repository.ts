import { getServerSupabase } from './supabase';
import { validatePostKind, type CommunityPostKind } from './post-kind';

export type CommunityContentStatus = 'visible' | 'hidden' | 'deleted';

export type CommunityPageCursor = {
  createdAt: string;
  id: string;
  kindRank?: number;
};

export type CommunityPageQuery = {
  cursor: CommunityPageCursor | null;
  limit: number;
};

export interface CommunityPostRecord {
  id: string;
  kind: CommunityPostKind;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  linkUrl: string | null;
  status: CommunityContentStatus;
  createdAt: string;
  commentCount: number;
  viewCount: number | null;
  recommendationCount: number | null;
}

export interface CommunityCommentRecord {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  body: string;
  status: CommunityContentStatus;
  parentStatus: CommunityContentStatus;
  createdAt: string;
}

export interface CommunityReadRepository {
  findPosts(query: CommunityPageQuery): Promise<CommunityPostRecord[]>;
  findPost(id: string): Promise<CommunityPostRecord | null>;
  findComments(
    postId: string,
    query: CommunityPageQuery,
  ): Promise<CommunityCommentRecord[]>;
}

export class CommunityRepositoryError extends Error {
  constructor(_providerDetail?: string) {
    super('커뮤니티 데이터를 불러오지 못했습니다.');
    this.name = 'CommunityRepositoryError';
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CommunityRepositoryError();
  }
  return value as Record<string, unknown>;
}

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== 'string') throw new CommunityRepositoryError();
  return value;
}

function getNullableString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== 'string') throw new CommunityRepositoryError();
  return value;
}

function getStatus(
  record: Record<string, unknown>,
  key: string,
): CommunityContentStatus {
  const value = getString(record, key);
  if (value !== 'visible' && value !== 'hidden' && value !== 'deleted') {
    throw new CommunityRepositoryError();
  }
  return value;
}

function toPostRecord(
  value: unknown,
  commentCount: number,
  counters: { viewCount: number; recommendationCount: number } | null,
): CommunityPostRecord {
  const row = asRecord(value);
  return {
    id: getString(row, 'id'),
    kind: row.kind === undefined ? 'normal' : validatePostKind(row.kind),
    authorId: getString(row, 'author_id'),
    authorName: getString(row, 'author_name'),
    title: getString(row, 'title'),
    body: getString(row, 'body'),
    linkUrl: getNullableString(row, 'link_url'),
    status: getStatus(row, 'status'),
    createdAt: getString(row, 'created_at'),
    commentCount,
    viewCount: counters?.viewCount ?? null,
    recommendationCount: counters?.recommendationCount ?? null,
  };
}

function getCounter(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new CommunityRepositoryError();
  }
  return value;
}

async function loadPostCounters(postIds: string[]) {
  if (postIds.length === 0) {
    return new Map<
      string,
      { viewCount: number; recommendationCount: number }
    >();
  }

  const { data, error } = await getServerSupabase()
    .from('community_posts')
    .select('id,view_count,recommendation_count')
    .in('id', postIds);

  // The engagement migration is deployed separately. Existing reads remain
  // available during that short window, while the UI renders unknown as —.
  if (error?.code === '42703') return null;
  if (error || !Array.isArray(data)) {
    throw new CommunityRepositoryError(error?.message);
  }

  return new Map(
    data.map((value) => {
      const row = asRecord(value);
      return [
        getString(row, 'id'),
        {
          viewCount: getCounter(row, 'view_count'),
          recommendationCount: getCounter(row, 'recommendation_count'),
        },
      ] as const;
    }),
  );
}

function getParentStatus(value: unknown): CommunityContentStatus {
  const relation = Array.isArray(value) ? value[0] : value;
  return getStatus(asRecord(relation), 'status');
}

function toCommentRecord(value: unknown): CommunityCommentRecord {
  const row = asRecord(value);
  return {
    id: getString(row, 'id'),
    postId: getString(row, 'post_id'),
    authorId: getString(row, 'author_id'),
    authorName: getString(row, 'author_name'),
    body: getString(row, 'body'),
    status: getStatus(row, 'status'),
    parentStatus: getParentStatus(row.community_posts),
    createdAt: getString(row, 'created_at'),
  };
}

async function loadVisibleCommentCounts(postIds: string[]) {
  if (postIds.length === 0) return new Map<string, number>();

  const { data, error } = await getServerSupabase()
    .from('community_comments')
    .select('post_id')
    .in('post_id', postIds)
    .eq('status', 'visible');

  if (error || !Array.isArray(data))
    throw new CommunityRepositoryError(error?.message);

  const counts = new Map<string, number>();
  for (const value of data) {
    const postId = getString(asRecord(value), 'post_id');
    counts.set(postId, (counts.get(postId) ?? 0) + 1);
  }
  return counts;
}

export const communityReadRepository: CommunityReadRepository = {
  async findPosts({ cursor, limit }) {
    const build = (ranked: boolean) => {
      let query = getServerSupabase()
        .from('community_posts')
        .select(
          `id,author_id,author_name,title,body,link_url,status,created_at${ranked ? ',kind,kind_rank' : ''}`,
        )
        .eq('status', 'visible');
      if (ranked) query = query.order('kind_rank', { ascending: false });
      query = query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);

      if (cursor) {
        query = query.or(
          ranked
            ? `kind_rank.lt.${cursor.kindRank},and(kind_rank.eq.${cursor.kindRank},created_at.lt.${cursor.createdAt}),and(kind_rank.eq.${cursor.kindRank},created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
            : `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
        );
      }
      return query;
    };
    let { data, error } = await build(true);
    if (error?.code === '42703' && (!cursor || cursor.kindRank === 0)) {
      ({ data, error } = await build(false));
    }
    if (error || !Array.isArray(data))
      throw new CommunityRepositoryError(error?.message);

    const counts = await loadVisibleCommentCounts(
      data.map((value) => getString(asRecord(value), 'id')),
    );
    const counters = await loadPostCounters(
      data.map((value) => getString(asRecord(value), 'id')),
    );
    return data.map((value) => {
      const id = getString(asRecord(value), 'id');
      return toPostRecord(
        value,
        counts.get(id) ?? 0,
        counters?.get(id) ?? null,
      );
    });
  },

  async findPost(id) {
    const build = (ranked: boolean) =>
      getServerSupabase()
        .from('community_posts')
        .select(
          `id,author_id,author_name,title,body,link_url,status,created_at${ranked ? ',kind' : ''}`,
        )
        .eq('id', id)
        .eq('status', 'visible')
        .maybeSingle();
    let { data, error } = await build(true);
    if (error?.code === '42703') ({ data, error } = await build(false));

    if (error) throw new CommunityRepositoryError(error.message);
    if (!data) return null;

    const counts = await loadVisibleCommentCounts([id]);
    const counters = await loadPostCounters([id]);
    return toPostRecord(data, counts.get(id) ?? 0, counters?.get(id) ?? null);
  },

  async findComments(postId, { cursor, limit }) {
    let query = getServerSupabase()
      .from('community_comments')
      .select(
        'id,post_id,author_id,author_name,body,status,created_at,community_posts!inner(status)',
      )
      .eq('post_id', postId)
      .eq('status', 'visible')
      .eq('community_posts.status', 'visible')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }
    const { data, error } = await query;
    if (error || !Array.isArray(data))
      throw new CommunityRepositoryError(error?.message);
    return data.map(toCommentRecord);
  },
};
