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
  return btoa(JSON.stringify([cursor.createdAt, cursor.id]))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function decodeCursor(value: string): CommunityPageCursor {
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded: unknown = JSON.parse(atob(base64 + padding));
    if (!Array.isArray(decoded) || decoded.length !== 2) throw new Error();

    const [createdAt, id] = decoded;
    if (
      typeof createdAt !== 'string' ||
      typeof id !== 'string' ||
      !isCommunityUuid(id) ||
      Number.isNaN(Date.parse(createdAt)) ||
      new Date(createdAt).toISOString() !== createdAt
    ) {
      throw new Error();
    }
    return { createdAt, id: id.toLowerCase() };
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
    authorName: post.authorName,
    title: post.title,
    excerpt: createExcerpt(post.body),
    linkUrl: post.linkUrl,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
  };
}

function toPostDetail(
  post: CommunityPostRecord,
  actorId: string | null,
): CommunityPostDetail {
  return {
    id: post.id,
    authorName: post.authorName,
    title: post.title,
    body: post.body,
    linkUrl: post.linkUrl,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
    ...(actorId ? { canDelete: post.authorId === actorId } : {}),
  };
}

function toComment(
  comment: CommunityCommentRecord,
  actorId: string | null,
): CommunityComment {
  return {
    id: comment.id,
    postId: comment.postId,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt,
    ...(actorId ? { canDelete: comment.authorId === actorId } : {}),
  };
}

function createPage<T extends { id: string; createdAt: string }>(
  items: T[],
  limit: number,
) {
  const pageItems = items.slice(0, limit);
  const last = pageItems.at(-1);
  return {
    pageItems,
    nextCursor:
      items.length > limit && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  };
}

export async function listPosts(
  cursor: string | null,
  limit: number = DEFAULT_POST_LIMIT,
  repository: CommunityReadRepository = communityReadRepository,
): Promise<PostPage> {
  const selectedLimit = getLimit(limit, DEFAULT_POST_LIMIT);
  const rows = await repository.findPosts({
    cursor: validateCommunityCursor(cursor),
    limit: selectedLimit + 1,
  });
  const visible = rows
    .filter((post) => post.status === 'visible')
    .sort(compareNewestFirst)
    .map(toPostSummary);
  const page = createPage(visible, selectedLimit);
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
): Promise<CommentPage> {
  if (!isCommunityUuid(postId)) {
    throw new CommunityReadInputError(
      'invalid_post_id',
      '게시글 정보를 확인할 수 없습니다.',
    );
  }
  const selectedLimit = getLimit(limit, DEFAULT_COMMENT_LIMIT);
  const rows = await repository.findComments(postId.toLowerCase(), {
    cursor: validateCommunityCursor(cursor),
    limit: selectedLimit + 1,
  });
  const visible = rows
    .filter(
      (comment) =>
        comment.status === 'visible' && comment.parentStatus === 'visible',
    )
    .sort(compareNewestFirst)
    .map((comment) => toComment(comment, actorId));
  const page = createPage(visible, selectedLimit);
  return { items: page.pageItems, nextCursor: page.nextCursor };
}
