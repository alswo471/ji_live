import { CommunityInputError } from './validation';

export type CommunityPostKind = 'normal' | 'notice' | 'required';
export const postKindLabels = {
  normal: '일반',
  notice: '공지',
  required: '필독',
} as const;
export const postKindRank = { normal: 0, notice: 1, required: 2 } as const;

export function validatePostKind(value: unknown): CommunityPostKind {
  if (value !== 'normal' && value !== 'notice' && value !== 'required') {
    throw new CommunityInputError(
      'invalid_post_kind',
      '글 종류를 확인해 주세요.',
    );
  }
  return value;
}

export function formatCommunityDate(value: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}.${part('month')}.${part('day')}.`;
}
