import {
  COMMUNITY_LIMITS,
  REPORT_REASONS,
  type CommentInput,
  type PostInput,
  type ReportInput,
  type ReportReason,
  type ReportTargetType,
} from './types';

const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;
const URL_LIKE_PATTERN = /(?:https?:\/\/|javascript:|data:)[^\s<>"']+/gi;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const URL_SHORTENERS = new Set(['bit.ly', 't.co', 'tinyurl.com']);

export class CommunityInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunityInputError';
  }
}

function getRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CommunityInputError(
      'invalid_input',
      '입력 형식이 올바르지 않습니다.',
    );
  }
  return value as Record<string, unknown>;
}

function getString(
  record: Record<string, unknown>,
  key: string,
  code: string,
  message: string,
) {
  const value = record[key];
  if (typeof value !== 'string') throw new CommunityInputError(code, message);
  return value.trim();
}

function getCharacterLength(value: string) {
  return Array.from(value).length;
}

function assertPlainText(value: string) {
  if (HTML_TAG_PATTERN.test(value)) {
    throw new CommunityInputError(
      'html_not_allowed',
      'HTML 형식은 사용할 수 없습니다.',
    );
  }
}

function findUrlLikeValues(value: string) {
  return value.match(URL_LIKE_PATTERN) ?? [];
}

function parseHttpsUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CommunityInputError(
      'invalid_link',
      '올바른 HTTPS 링크를 입력해 주세요.',
    );
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new CommunityInputError(
      'invalid_link',
      'HTTPS 링크만 사용할 수 있습니다.',
    );
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    URL_SHORTENERS.has(hostname) ||
    [...URL_SHORTENERS].some((item) => hostname.endsWith(`.${item}`))
  ) {
    throw new CommunityInputError(
      'shortened_link_not_allowed',
      '최종 주소를 확인할 수 없는 단축 링크는 사용할 수 없습니다.',
    );
  }

  return url.toString();
}

function validateUuid(value: string, code: string, message: string) {
  if (!UUID_PATTERN.test(value)) throw new CommunityInputError(code, message);
  return value.toLowerCase();
}

export function validatePostInput(value: unknown): PostInput {
  const record = getRecord(value);
  const title = getString(
    record,
    'title',
    'invalid_title',
    '제목을 입력해 주세요.',
  );
  const body = getString(
    record,
    'body',
    'invalid_body',
    '본문을 입력해 주세요.',
  );
  const idempotencyKey = getString(
    record,
    'idempotencyKey',
    'invalid_idempotency_key',
    '요청 식별자가 올바르지 않습니다.',
  );

  if (
    getCharacterLength(title) < COMMUNITY_LIMITS.titleMin ||
    getCharacterLength(title) > COMMUNITY_LIMITS.titleMax
  ) {
    throw new CommunityInputError(
      'invalid_title_length',
      `제목은 ${COMMUNITY_LIMITS.titleMin}–${COMMUNITY_LIMITS.titleMax}자로 입력해 주세요.`,
    );
  }

  if (
    getCharacterLength(body) < 1 ||
    getCharacterLength(body) > COMMUNITY_LIMITS.bodyMax
  ) {
    throw new CommunityInputError(
      'invalid_body_length',
      `본문은 ${COMMUNITY_LIMITS.bodyMax}자 이하로 입력해 주세요.`,
    );
  }

  assertPlainText(title);
  assertPlainText(body);

  const rawLink = record.linkUrl;
  if (
    rawLink !== undefined &&
    rawLink !== null &&
    typeof rawLink !== 'string'
  ) {
    throw new CommunityInputError(
      'invalid_link',
      '올바른 HTTPS 링크를 입력해 주세요.',
    );
  }

  const trimmedLink = typeof rawLink === 'string' ? rawLink.trim() : '';
  const bodyLinks = findUrlLikeValues(body);
  const normalizedBodyLinks = bodyLinks.map(parseHttpsUrl);
  const linkUrl = trimmedLink ? parseHttpsUrl(trimmedLink) : null;

  if (normalizedBodyLinks.length + (linkUrl ? 1 : 0) > 1) {
    throw new CommunityInputError(
      'too_many_links',
      '링크는 게시글당 하나만 사용할 수 있습니다.',
    );
  }

  return {
    title,
    body,
    linkUrl,
    idempotencyKey: validateUuid(
      idempotencyKey,
      'invalid_idempotency_key',
      '요청 식별자가 올바르지 않습니다.',
    ),
  };
}

export function validateCommentInput(value: unknown): CommentInput {
  const record = getRecord(value);
  const body = getString(
    record,
    'body',
    'invalid_comment',
    '댓글을 입력해 주세요.',
  );
  const idempotencyKey = getString(
    record,
    'idempotencyKey',
    'invalid_idempotency_key',
    '요청 식별자가 올바르지 않습니다.',
  );

  if (
    getCharacterLength(body) < 1 ||
    getCharacterLength(body) > COMMUNITY_LIMITS.commentMax
  ) {
    throw new CommunityInputError(
      'invalid_comment_length',
      `댓글은 ${COMMUNITY_LIMITS.commentMax}자 이하로 입력해 주세요.`,
    );
  }

  assertPlainText(body);
  if (findUrlLikeValues(body).length > 0) {
    throw new CommunityInputError(
      'link_not_allowed',
      '댓글에는 링크를 입력할 수 없습니다.',
    );
  }

  return {
    body,
    idempotencyKey: validateUuid(
      idempotencyKey,
      'invalid_idempotency_key',
      '요청 식별자가 올바르지 않습니다.',
    ),
  };
}

export function validateReportInput(value: unknown): ReportInput {
  const record = getRecord(value);
  const targetType = getString(
    record,
    'targetType',
    'invalid_report_target',
    '신고 대상을 확인할 수 없습니다.',
  );
  const targetId = getString(
    record,
    'targetId',
    'invalid_report_target',
    '신고 대상을 확인할 수 없습니다.',
  );
  const reason = getString(
    record,
    'reason',
    'invalid_report_reason',
    '신고 사유를 선택해 주세요.',
  );
  const detail = getString(
    record,
    'detail',
    'invalid_report_detail',
    '신고 내용을 확인해 주세요.',
  );

  if (targetType !== 'post' && targetType !== 'comment') {
    throw new CommunityInputError(
      'invalid_report_target',
      '신고 대상을 확인할 수 없습니다.',
    );
  }
  if (!REPORT_REASONS.includes(reason as ReportReason)) {
    throw new CommunityInputError(
      'invalid_report_reason',
      '신고 사유를 선택해 주세요.',
    );
  }
  if (getCharacterLength(detail) > COMMUNITY_LIMITS.reportDetailMax) {
    throw new CommunityInputError(
      'invalid_report_detail_length',
      `신고 내용은 ${COMMUNITY_LIMITS.reportDetailMax}자 이하로 입력해 주세요.`,
    );
  }

  assertPlainText(detail);

  return {
    targetType: targetType as ReportTargetType,
    targetId: validateUuid(
      targetId,
      'invalid_report_target',
      '신고 대상을 확인할 수 없습니다.',
    ),
    reason: reason as ReportReason,
    detail,
  };
}
