import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from '@/components/community/turnstile-challenge';

type Options = {
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
};

describe('TurnstileChallenge', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    delete window.turnstile;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete window.turnstile;
    document
      .querySelectorAll('script[src*="challenges.cloudflare.com/turnstile"]')
      .forEach((script) => script.remove());
  });

  it('surfaces a script failure and retries with a fresh loader', async () => {
    const ref = createRef<TurnstileChallengeHandle>();
    render(<TurnstileChallenge ref={ref} />);
    const firstScript = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile"]',
    );
    expect(firstScript).not.toBeNull();

    fireEvent.error(firstScript!);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '사용자 확인을 불러오지 못했습니다',
    );
    await expect(ref.current?.execute()).rejects.toThrow('Turnstile unavailable');

    fireEvent.click(screen.getByRole('button', { name: '사용자 확인 다시 시도' }));
    await waitFor(() => {
      const scripts = document.querySelectorAll(
        'script[src*="challenges.cloudflare.com/turnstile"]',
      );
      expect(scripts).toHaveLength(1);
      expect(scripts[0]).not.toBe(firstScript);
    });
  });

  it('rejects every pending waiter on widget error and on unmount', async () => {
    let options!: Options;
    window.turnstile = {
      render: vi.fn((_container, nextOptions) => {
        options = nextOptions as Options;
        return 'widget-id';
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const ref = createRef<TurnstileChallengeHandle>();
    const view = render(<TurnstileChallenge ref={ref} />);
    await screen.findByText('사용자 확인 준비됨');

    const first = ref.current!.execute();
    const second = ref.current!.execute();
    const firstResult = expect(first).rejects.toThrow('Turnstile unavailable');
    const secondResult = expect(second).rejects.toThrow('Turnstile unavailable');
    act(() => options['error-callback']());
    await Promise.all([firstResult, secondResult]);

    fireEvent.click(screen.getByRole('button', { name: '사용자 확인 다시 시도' }));
    await screen.findByText('사용자 확인 준비됨');
    const pending = ref.current!.execute();
    const pendingResult = expect(pending).rejects.toThrow('Turnstile unavailable');
    view.unmount();
    await pendingResult;
  });

  it('bounds execution time and rejects pending work on token expiry', async () => {
    vi.useFakeTimers();
    let options!: Options;
    window.turnstile = {
      render: vi.fn((_container, nextOptions) => {
        options = nextOptions as Options;
        return 'widget-id';
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const ref = createRef<TurnstileChallengeHandle>();
    render(<TurnstileChallenge ref={ref} />);
    await act(async () => Promise.resolve());

    const expired = ref.current!.execute();
    const expiredResult = expect(expired).rejects.toThrow('Turnstile unavailable');
    act(() => options['expired-callback']());
    await expiredResult;

    fireEvent.click(screen.getByRole('button', { name: '사용자 확인 다시 시도' }));
    await act(async () => Promise.resolve());
    const timedOut = ref.current!.execute();
    const timeoutResult = expect(timedOut).rejects.toThrow('Turnstile timeout');
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    await timeoutResult;
    expect(screen.getByRole('alert')).toHaveTextContent('시간이 초과');
  });
});
