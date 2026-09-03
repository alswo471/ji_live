import type { CommunityAdmin } from './admin-auth';
import {
  type CommunityContentStatus,
  type CommunityPageCursor,
} from './repository';
import { isCommunityUuid, validateCommunityCursor } from './read-service';
import { getServerSupabase } from './supabase';
import type { ReportReason, ReportTargetType } from './types';

export type ModerationAction =
  | {
      type: 'hide' | 'restore' | 'delete';
      targetType: ReportTargetType;
      targetId: string;
      reason: string;
    }
  | { type: 'restrict'; userId: string; until: string; reason: string };

export interface ModerationReportRecord {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetAuthorId: string;
  targetTitle: string | null;
  targetBody: string;
  targetStatus: CommunityContentStatus;
  reason: ReportReason;
  detail: string;
  createdAt: string;
}

export interface ModerationRepository {
  findOpenReports(input: {
    cursor: CommunityPageCursor | null;
    limit: number;
  }): Promise<ModerationReportRecord[]>;
  applyAction(adminId: string, action: ModerationAction): Promise<void>;
}

export type ModerationQueueItem = ModerationReportRecord;

export interface ModerationPage {
  items: ModerationQueueItem[];
  nextCursor: string | null;
}

export class CommunityModerationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunityModerationError';
  }
}

function failProvider(error?: { code?: string } | null): never {
  if (error?.code === 'P0002' || error?.code === '23503') {
    throw new CommunityModerationError(
      404,
      'moderation_target_not_found',
      '관리할 콘텐츠를 찾을 수 없습니다.',
    );
  }
  throw new CommunityModerationError(
    503,
    'moderation_unavailable',
    '관리 요청을 처리하지 못했습니다.',
  );
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failProvider();
  }
  return value as Record<string, unknown>;
}

function string(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== 'string') failProvider();
  return value;
}

function relation(value: unknown) {
  const resolved = Array.isArray(value) ? value[0] : value;
  return object(resolved);
}

function contentStatus(row: Record<string, unknown>) {
  const value = string(row, 'status');
  if (value !== 'visible' && value !== 'hidden' && value !== 'deleted') {
    failProvider();
  }
  return value;
}

function reportReason(row: Record<string, unknown>) {
  const value = string(row, 'reason');
  if (
    value !== 'privacy' &&
    value !== 'illegal' &&
    value !== 'copyright' &&
    value !== 'harassment' &&
    value !== 'spam' &&
    value !== 'financial_solicitation' &&
    value !== 'other'
  ) {
    failProvider();
  }
  return value;
}

function toReport(value: unknown): ModerationReportRecord {
  const row = object(value);
  const postId = row.post_id;
  const commentId = row.comment_id;
  const targetType: ReportTargetType =
    typeof postId === 'string' ? 'post' : 'comment';
  const target = relation(
    targetType === 'post' ? row.community_posts : row.community_comments,
  );
  const targetId = targetType === 'post' ? postId : commentId;
  if (typeof targetId !== 'string') failProvider();
  return {
    id: string(row, 'id'),
    targetType,
    targetId,
    targetAuthorId: string(target, 'author_id'),
    targetTitle: targetType === 'post' ? string(target, 'title') : null,
    targetBody: string(target, 'body'),
    targetStatus: contentStatus(target),
    reason: reportReason(row),
    detail: string(row, 'detail'),
    createdAt: string(row, 'created_at'),
  };
}

function encodeCursor(item: Pick<ModerationReportRecord, 'createdAt' | 'id'>) {
  return btoa(JSON.stringify([item.createdAt, item.id]))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

export const moderationRepository: ModerationRepository = {
  async findOpenReports({ cursor, limit }) {
    let query = getServerSupabase()
      .from('community_reports')
      .select(
        'id,post_id,comment_id,reason,detail,status,created_at,community_posts!community_reports_post_id_fkey(id,author_id,title,body,status),community_comments!community_reports_comment_id_fkey(id,author_id,body,status)',
      )
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }
    const { data, error } = await query;
    if (error || !Array.isArray(data)) failProvider(error);
    return data.map(toReport);
  },

  async applyAction(adminId, action) {
    const contentAction = action.type !== 'restrict';
    const { error } = await getServerSupabase().rpc(
      'moderate_community_content',
      {
        p_admin_id: adminId,
        p_action: action.type,
        p_target_type: contentAction ? action.targetType : 'user',
        p_target_id: contentAction ? action.targetId : null,
        p_user_id: contentAction ? null : action.userId,
        p_until: contentAction ? null : action.until,
        p_reason: action.reason,
      },
    );
    if (error) failProvider(error);
  },
};

function normalizedReason(value: unknown) {
  if (typeof value !== 'string') {
    throw new CommunityModerationError(
      400,
      'invalid_moderation_reason',
      '관리 사유를 입력해 주세요.',
    );
  }
  const reason = value.trim();
  const length = Array.from(reason).length;
  if (length < 5 || length > 500) {
    throw new CommunityModerationError(
      400,
      'invalid_moderation_reason',
      '관리 사유는 5자 이상 500자 이하로 입력해 주세요.',
    );
  }
  return reason;
}

function normalizedAction(input: unknown, now: Date): ModerationAction {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CommunityModerationError(
      400,
      'invalid_moderation_action',
      '관리 조치 내용을 확인해 주세요.',
    );
  }
  const row = input as Record<string, unknown>;
  const type = row.type;
  if (
    type !== 'hide' &&
    type !== 'restore' &&
    type !== 'delete' &&
    type !== 'restrict'
  ) {
    throw new CommunityModerationError(
      400,
      'invalid_moderation_action',
      '관리 조치 내용을 확인해 주세요.',
    );
  }
  const reason = normalizedReason(row.reason);
  if (type === 'restrict') {
    const userId = row.userId;
    const until = row.until;
    if (typeof userId !== 'string' || !isCommunityUuid(userId)) {
      throw new CommunityModerationError(
        400,
        'invalid_moderation_user',
        '제한할 사용자를 확인해 주세요.',
      );
    }
    if (
      typeof until !== 'string' ||
      Number.isNaN(Date.parse(until)) ||
      new Date(until).toISOString() !== until ||
      Date.parse(until) <= now.getTime()
    ) {
      throw new CommunityModerationError(
        400,
        'invalid_restriction_until',
        '현재보다 이후인 제한 종료 시각을 입력해 주세요.',
      );
    }
    return { type, userId: userId.toLowerCase(), until, reason };
  }
  const targetType = row.targetType;
  const targetId = row.targetId;
  if (
    (targetType !== 'post' && targetType !== 'comment') ||
    typeof targetId !== 'string' ||
    !isCommunityUuid(targetId)
  ) {
    throw new CommunityModerationError(
      400,
      'invalid_moderation_target',
      '관리할 콘텐츠를 확인해 주세요.',
    );
  }
  return {
    type,
    targetType,
    targetId: targetId.toLowerCase(),
    reason,
  };
}

export async function listModerationQueue(
  cursor: string | null,
  repository: ModerationRepository = moderationRepository,
): Promise<ModerationPage> {
  const limit = 20;
  const rows = await repository.findOpenReports({
    cursor: validateCommunityCursor(cursor),
    limit: limit + 1,
  });
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor:
      rows.length > limit && items.length > 0
        ? encodeCursor(items[items.length - 1])
        : null,
  };
}

export async function moderateContent(
  admin: CommunityAdmin,
  input: unknown,
  repository: ModerationRepository = moderationRepository,
  now: Date = new Date(),
) {
  await repository.applyAction(admin.id, normalizedAction(input, now));
}
