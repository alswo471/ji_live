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

export interface CommunityPostSummary {
  id: string;
  authorName: string;
  title: string;
  excerpt: string;
  linkUrl: string | null;
  commentCount: number;
  createdAt: string;
}

export interface CommunityPostDetail extends Omit<
  CommunityPostSummary,
  'excerpt'
> {
  body: string;
  canDelete?: boolean;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorName: string;
  body: string;
  createdAt: string;
  canDelete?: boolean;
}

export interface PostPage {
  items: CommunityPostSummary[];
  nextCursor: string | null;
}

export interface CommentPage {
  items: CommunityComment[];
  nextCursor: string | null;
}

export interface ReportReceipt {
  accepted: true;
  temporarilyHidden: boolean;
}
