export const communityFeeds = {
  all: {
    label: '전체글',
    description: '필독·공지와 최신 이야기를 확인하세요.',
  },
  notices: {
    label: '공지사항',
    description: '필독 안내와 커뮤니티 공지입니다.',
  },
  popular: {
    label: '인기글',
    description: '전체 기간 · 추천 많은 순 · 동점이면 최신순',
  },
} as const;

export type CommunityFeedKind = keyof typeof communityFeeds;

export function isCommunityFeed(value: unknown): value is CommunityFeedKind {
  return value === 'all' || value === 'notices' || value === 'popular';
}
