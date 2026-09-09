import { render, screen } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import CommunityPage from '@/app/community/page';

const navigation = vi.hoisted(() => ({ search: new URLSearchParams() }));
vi.mock('vinext/shims/navigation', () => ({
  useSearchParams: () => navigation.search,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  navigation.search = new URLSearchParams();
});

it('exposes shareable feed navigation and marks the active popular page', async () => {
  navigation.search = new URLSearchParams('feed=popular');
  vi.stubEnv('NEXT_PUBLIC_COMMUNITY_ENABLED', 'true');
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<CommunityPage />);
  await screen.findByText('아직 게시글이 없습니다.');
  expect(screen.getByRole('link', { name: '인기글' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('link', { name: '공지사항' })).toHaveAttribute(
    'href',
    '/community?feed=notices',
  );
  expect(screen.getByRole('link', { name: '전체글' })).toHaveAttribute(
    'href',
    '/community',
  );
  expect(fetcher).toHaveBeenCalledWith(
    '/api/community/posts?feed=popular',
    expect.anything(),
  );
});

it('links to the dedicated writing page', async () => {
  vi.stubEnv('NEXT_PUBLIC_COMMUNITY_ENABLED', 'true');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ items: [], nextCursor: null })),
  );
  render(<CommunityPage />);
  await screen.findByText('아직 게시글이 없습니다.');
  expect(screen.getByRole('link', { name: '글쓰기' })).toHaveAttribute(
    'href',
    '/community/write',
  );
  expect(screen.queryByRole('textbox', { name: '제목' })).toBeNull();
});

it('does not expose the composer when the community release flag is disabled', () => {
  vi.stubEnv('NEXT_PUBLIC_COMMUNITY_ENABLED', 'false');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
  );
  render(<CommunityPage />);
  expect(screen.queryByRole('link', { name: '글쓰기' })).toBeNull();
  expect(screen.queryByRole('textbox', { name: '제목' })).toBeNull();
});
