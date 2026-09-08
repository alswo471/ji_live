import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import CommunityWritePage from '@/app/community/write/page';

const { communityWriteMock, pushMock } = vi.hoisted(() => ({
  communityWriteMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('vinext/shims/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock('@/lib/community/browser-api', () => ({
  communityWrite: communityWriteMock,
}));
vi.mock('@/hooks/use-community-session', () => ({
  useCommunitySession: () => ({
    status: 'ready',
    accessToken: 'token',
    error: null,
  }),
}));
vi.mock('@/components/community/turnstile-challenge', () => ({
  TurnstileChallenge: forwardRef(function Challenge(_props, ref) {
    useImperativeHandle(ref, () => ({ execute: async () => 'captcha' }));
    return null;
  }),
}));

beforeEach(() => {
  communityWriteMock.mockReset();
  pushMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_COMMUNITY_ENABLED', 'true');
});

it('reuses the post form and navigates to the returned post after success', async () => {
  communityWriteMock.mockResolvedValue({
    id: '30000000-0000-4000-8000-000000000001',
  });
  render(<CommunityWritePage />);
  fireEvent.change(screen.getByRole('textbox', { name: '제목' }), {
    target: { value: '새로운 시장 이야기' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: '내용' }), {
    target: { value: '오늘의 흐름을 공유합니다.' },
  });
  fireEvent.click(screen.getByRole('button', { name: '글 올리기' }));
  await waitFor(() =>
    expect(pushMock).toHaveBeenCalledWith(
      '/community/30000000-0000-4000-8000-000000000001',
    ),
  );
});

it('provides predictable cancel navigation and a visible draft-loss warning', () => {
  render(<CommunityWritePage />);
  expect(screen.getByRole('link', { name: '작성 취소' })).toHaveAttribute(
    'href',
    '/community',
  );
  expect(
    screen.getByText(/페이지를 떠나면 작성 중인 내용이 사라집니다/),
  ).toBeVisible();
});
