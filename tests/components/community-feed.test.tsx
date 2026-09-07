import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommunityFeed } from '@/components/community/community-feed';

describe('CommunityFeed', () => {
  it.each([
    ['loading', '게시글을 불러오고 있습니다'],
    ['error', '게시글을 불러오지 못했습니다'],
    ['empty', '아직 게시글이 없습니다'],
  ] as const)('%s state is explicit', (state, text) => {
    render(
      <CommunityFeed
        state={state}
        items={[]}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
  });

  it('renders text and a safe external domain without HTML interpretation', () => {
    render(
      <CommunityFeed
        state="ready"
        items={[
          {
            id: 'post-id',
            authorName: '차분한-고양이-0001',
            title: '<script>alert(1)</script>',
            excerpt: '시장 의견',
            linkUrl: 'https://example.com/path',
            commentCount: 2,
            createdAt: '2026-09-03T01:00:00.000Z',
          },
        ]}
        hasMore
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '게시글 더 보기' }),
    ).toBeVisible();
  });
});
