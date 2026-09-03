export const COMMUNITY_LIMITS = {
  titleMin: 2,
  titleMax: 80,
  bodyMax: 3000,
  commentMax: 1000,
  reportDetailMax: 500,
} as const;

export const REPORT_REASONS = [
  'privacy',
  'illegal',
  'copyright',
  'harassment',
  'spam',
  'financial_solicitation',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetType = 'post' | 'comment';

export interface PostInput {
  title: string;
  body: string;
  linkUrl: string | null;
  idempotencyKey: string;
}

export interface CommentInput {
  body: string;
  idempotencyKey: string;
}

export interface ReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  detail: string;
}

export interface CommunityActor {
  id: string;
  isAnonymous: boolean;
  email: string | null;
}
