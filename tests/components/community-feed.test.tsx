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
            kind: 'required',
            authorName: '차분한-고양이-0001',
            title: '<script>alert(1)</script>',
            excerpt: '시장 의견',
            linkUrl: 'https://example.com/path',
            commentCount: 2,
            viewCount: 12,
            recommendationCount: 3,
            createdAt: '2026-04-14T15:00:00.000Z',
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
    expect(screen.getByText('필독')).toBeInTheDocument();
    expect(screen.getByText('2026.04.15.')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '게시글 더 보기' }),
    ).toBeVisible();
  });

  it('renders unavailable counters as dashes instead of fake zeroes', () => {
    render(
      <CommunityFeed
        state="ready"
        items={[
          {
            id: 'post-id',
            kind: 'normal',
            authorName: '차분한-고양이-0001',
            title: '집계 준비 중인 글',
            excerpt: '기존 글은 계속 읽힙니다.',
            linkUrl: null,
            commentCount: 0,
            viewCount: null,
            recommendationCount: null,
            createdAt: '2026-09-03T01:00:00.000Z',
          },
        ]}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});
