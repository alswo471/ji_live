import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import CommunityPage from '@/app/community/page';

vi.mock('@/hooks/use-community-session', () => ({
  useCommunitySession: () => ({ status: 'idle', accessToken: null }),
}));
vi.mock('@/components/community/turnstile-challenge', () => ({
  TurnstileChallenge: () => null,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('opens the composer with focus and preserves an unsent draft when collapsed', async () => {
  vi.stubEnv('NEXT_PUBLIC_COMMUNITY_ENABLED', 'true');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ items: [], nextCursor: null })),
  );
  render(<CommunityPage />);
  await screen.findByText('아직 게시글이 없습니다.');
  expect(screen.queryByRole('textbox', { name: '제목' })).toBeNull();
  const toggle = screen.getByRole('button', { name: '글쓰기' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  const title = screen.getByRole('textbox', { name: '제목' });
  expect(title).toHaveFocus();
  fireEvent.change(title, { target: { value: '작성 중인 시장 이야기' } });
  fireEvent.click(screen.getByRole('button', { name: '글쓰기 접기' }));
  expect(screen.queryByRole('textbox', { name: '제목' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '글쓰기' }));
  expect(screen.getByRole('textbox', { name: '제목' })).toHaveValue(
    '작성 중인 시장 이야기',
  );
});

it('does not expose the composer when the community release flag is disabled', () => {
  vi.stubEnv('NEXT_PUBLIC_COMMUNITY_ENABLED', 'false');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
  );
  render(<CommunityPage />);
  expect(screen.queryByRole('button', { name: '글쓰기' })).toBeNull();
  expect(screen.queryByRole('textbox', { name: '제목' })).toBeNull();
});
