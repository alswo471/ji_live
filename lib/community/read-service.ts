import {
  communityReadRepository,
  type CommunityCommentRecord,
  type CommunityPageCursor,
  type CommunityPostRecord,
  type CommunityReadRepository,
} from './repository';
import type {
  CommentPage,
  CommunityComment,
  CommunityPostDetail,
  CommunityPostSummary,
  PostPage,
} from './types';
import { postKindRank } from './post-kind';
import { isCommunityFeed, type CommunityFeedKind } from './feed';

const DEFAULT_POST_LIMIT = 20;
const DEFAULT_COMMENT_LIMIT = 30;
const MAX_PAGE_LIMIT = 30;
const EXCERPT_LENGTH = 180;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CommunityReadInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunityReadInputError';
  }
}

export function isCommunityUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function getLimit(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.trunc(value)));
}

function encodeCursor(cursor: CommunityPageCursor) {
  return btoa(
    JSON.stringify([
      cursor.createdAt,
      cursor.id,
      ...(cursor.kindRank === undefined ? [] : [cursor.kindRank]),
      ...(cursor.feed ? [cursor.feed, cursor.recommendationCount ?? null] : []),
    ]),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function decodeCursor(value: string): CommunityPageCursor {
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded: unknown = JSON.parse(atob(base64 + padding));
    if (!Array.isArray(decoded) || ![2, 3, 5].includes(decoded.length))
      throw new Error();

    const [createdAt, id, kindRank, feed, recommendationCount] = decoded;
    if (decoded.length >= 3 && ![0, 1, 2].includes(kindRank)) throw new Error();
    if (
      decoded.length === 5 &&
      (!isCommunityFeed(feed) ||
        (feed === 'popular'
          ? !Number.isSafeInteger(recommendationCount) ||
            recommendationCount < 0
          : recommendationCount !== null))
    )
      throw new Error();
    if (
      typeof createdAt !== 'string' ||
      typeof id !== 'string' ||
      !isCommunityUuid(id) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
        createdAt,
      ) ||
      Number.isNaN(Date.parse(createdAt)) ||
      new Date(createdAt).toISOString().slice(0, 19) !== createdAt.slice(0, 19)
    ) {
      throw new Error();
    }
    return {
      createdAt,
      id: id.toLowerCase(),
      ...(kindRank === undefined ? {} : { kindRank }),
      ...(feed === undefined
        ? {}
        : {
            feed,
            ...(recommendationCount === null ? {} : { recommendationCount }),
          }),
    };
  } catch {
    throw new CommunityReadInputError(
      'invalid_cursor',
      '페이지 정보를 확인할 수 없습니다.',
    );
  }
}

export function validateCommunityCursor(value: string | null) {
  return value === null ? null : decodeCursor(value);
}

export function validateCommentCursor(
  value: string | null,
  postId: string,
  parentCommentId: string | null,
) {
  if (parentCommentId !== null && !isCommunityUuid(parentCommentId)) {
    throw new CommunityReadInputError(
      'invalid_parent_comment_id',
      '원댓글 정보를 확인할 수 없습니다.',
    );
  }
  if (value === null) return null;
  try {
    const decoded: unknown = JSON.parse(
      atob(value.replaceAll('-', '+').replaceAll('_', '/')),
    );
    if (
      Array.isArray(decoded) &&
      decoded.length === 5 &&
      decoded[0] === 'comments' &&
      decoded[1] === postId &&
      decoded[2] === parentCommentId
    ) {
      return decodeCursor(btoa(JSON.stringify(decoded.slice(3))));
    }
    // Root cursors issued before this additive deployment remain usable for roots only.
    if (!parentCommentId && Array.isArray(decoded) && decoded.length === 2)
      return decodeCursor(value);
  } catch {
    /* Report all malformed or cross-scope cursors consistently. */
  }
  throw new CommunityReadInputError(
    'invalid_cursor',
    '페이지 정보를 확인할 수 없습니다.',
  );
}

export function validateCommunityFeed(value: unknown): CommunityFeedKind {
  if (value === null || value === undefined) return 'all';
  if (isCommunityFeed(value)) return value;
  throw new CommunityReadInputError(
    'invalid_feed',
    '게시판 종류를 확인할 수 없습니다.',
  );
}

function compareNewestFirst(
  left: { createdAt: string; id: string },
  right: { createdAt: string; id: string },
) {
  const time = right.createdAt.localeCompare(left.createdAt);
  return time === 0 ? right.id.localeCompare(left.id) : time;
}

function createExcerpt(body: string) {
  const characters = Array.from(body);
  return characters.length <= EXCERPT_LENGTH
    ? body
    : `${characters.slice(0, EXCERPT_LENGTH).join('')}…`;
}

function toPostSummary(post: CommunityPostRecord): CommunityPostSummary {
  return {
    id: post.id,
    kind: post.kind,
    authorName: post.authorName,
    title: post.title,
    excerpt: createExcerpt(post.body),
    linkUrl: post.linkUrl,
    commentCount: post.commentCount,
    viewCount: post.viewCount,
    recommendationCount: post.recommendationCount,
    createdAt: post.createdAt,
  };
}

function toPostDetail(
  post: CommunityPostRecord,
  actorId: string | null,
): CommunityPostDetail {
  return {
    id: post.id,
    kind: post.kind,
    authorName: post.authorName,
    title: post.title,
    body: post.body,
    linkUrl: post.linkUrl,
    commentCount: post.commentCount,
    viewCount: post.viewCount,
    recommendationCount: post.recommendationCount,
    createdAt: post.createdAt,
    ...(actorId ? { canDelete: post.authorId === actorId } : {}),
  };
}

function toComment(
  comment: CommunityCommentRecord,
  actorId: string | null,
): CommunityComment {
  if (comment.unavailable) {
    return {
      id: comment.id,
      postId: comment.postId,
      authorName: '',
      body: '삭제·숨김 처리된 댓글입니다.',
      createdAt: comment.createdAt,
      canDelete: false,
      parentCommentId: null,
      replyCount: comment.replyCount ?? 0,
      unavailable: true,
    };
  }
  return {
    id: comment.id,
    postId: comment.postId,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt,
    ...(actorId ? { canDelete: comment.authorId === actorId } : {}),
    ...(comment.parentCommentId === undefined
      ? {}
      : { parentCommentId: comment.parentCommentId }),
    ...(comment.replyCount === undefined
      ? {}
      : { replyCount: comment.replyCount }),
    ...(comment.unavailable === undefined ? {} : { unavailable: false }),
  };
}

function createPage<
  T extends { id: string; createdAt: string; kind?: keyof typeof postKindRank },
>(items: T[], limit: number) {
  const pageItems = items.slice(0, limit);
  const last = pageItems.at(-1);
  return {
    pageItems,
    nextCursor:
      items.length > limit && last
        ? encodeCursor({
            createdAt: last.createdAt,
            id: last.id,
            ...(last.kind ? { kindRank: postKindRank[last.kind] } : {}),
          })
        : null,
  };
}

export async function listPosts(
  cursor: string | null,
  limit: number = DEFAULT_POST_LIMIT,
  repository: CommunityReadRepository = communityReadRepository,
  feed: CommunityFeedKind = 'all',
): Promise<PostPage> {
  validateCommunityFeed(feed);
  const selectedLimit = getLimit(limit, DEFAULT_POST_LIMIT);
  const decoded = validateCommunityCursor(cursor);
  if (decoded && decoded.kindRank === undefined) {
    throw new CommunityReadInputError(
      'stale_cursor',
      '글 정렬이 변경되었습니다. 목록을 새로고침해 주세요.',
    );
  }
  if (decoded && (decoded.feed ?? 'all') !== feed) {
    throw new CommunityReadInputError(
      'invalid_cursor',
      '게시판이 변경되었습니다. 목록을 새로고침해 주세요.',
    );
  }
  const rows = await repository.findPosts({
    cursor: decoded,
    limit: selectedLimit + 1,
    ...(feed === 'all' ? {} : { feed }),
  });
  // Preserve the database's rank/time/id order and full timestamp precision.
  const visible = rows
    .filter((post) => post.status === 'visible')
    .map(toPostSummary);
  const page = createPage(visible, selectedLimit);
  const last = page.pageItems.at(-1);
  if (feed !== 'all' && page.nextCursor && last) {
    page.nextCursor = encodeCursor({
      createdAt: last.createdAt,
      id: last.id,
      kindRank: postKindRank[last.kind],
      feed,
      ...(feed === 'popular'
        ? { recommendationCount: last.recommendationCount ?? undefined }
        : {}),
    });
  }
  return { items: page.pageItems, nextCursor: page.nextCursor };
}

export async function getPost(
  id: string,
  actorId: string | null = null,
  repository: CommunityReadRepository = communityReadRepository,
): Promise<CommunityPostDetail | null> {
  if (!isCommunityUuid(id)) {
    throw new CommunityReadInputError(
      'invalid_post_id',
      '게시글 정보를 확인할 수 없습니다.',
    );
  }
  const post = await repository.findPost(id.toLowerCase());
  return post?.status === 'visible' ? toPostDetail(post, actorId) : null;
}

export async function listComments(
  postId: string,
  cursor: string | null,
  limit: number = DEFAULT_COMMENT_LIMIT,
  actorId: string | null = null,
  repository: CommunityReadRepository = communityReadRepository,
  parentCommentId: string | null = null,
): Promise<CommentPage> {
  if (!isCommunityUuid(postId)) {
    throw new CommunityReadInputError(
      'invalid_post_id',
      '게시글 정보를 확인할 수 없습니다.',
    );
  }
  const selectedLimit = getLimit(limit, DEFAULT_COMMENT_LIMIT);
  const normalizedParent = parentCommentId?.toLowerCase() ?? null;
  const query = {
    cursor: validateCommentCursor(
      cursor,
      postId.toLowerCase(),
      normalizedParent,
    ),
    limit: selectedLimit + 1,
  };
  const threads = repository.findCommentThreads
    ? await repository.findCommentThreads(
        postId.toLowerCase(),
        normalizedParent,
        query,
      )
    : null;
  if (normalizedParent && !threads?.repliesEnabled) {
    throw new CommunityReadInputError(
      'replies_unavailable',
      '답글을 아직 사용할 수 없습니다.',
    );
  }
  const rows =
    threads?.items ??
    (await repository.findComments(postId.toLowerCase(), query));
  const visible = rows
    .filter(
      (comment) =>
        (comment.status === 'visible' ||
          (!normalizedParent &&
            comment.unavailable &&
            (comment.replyCount ?? 0) > 0)) &&
        comment.parentStatus === 'visible',
    )
    .map((comment) => toComment(comment, actorId));
  if (!threads) visible.sort(compareNewestFirst);
  const page = createPage(visible, selectedLimit);
  const last = page.pageItems.at(-1);
  if (threads?.repliesEnabled && page.nextCursor && last) {
    page.nextCursor = btoa(
      JSON.stringify([
        'comments',
        postId.toLowerCase(),
        normalizedParent,
        last.createdAt,
        last.id,
      ]),
    )
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/g, '');
  }
  return {
    items: page.pageItems,
    nextCursor: page.nextCursor,
    ...(threads ? { repliesEnabled: threads.repliesEnabled } : {}),
  };
}
