import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminLogin } from '@/components/community/admin-login';

describe('AdminLogin', () => {
  it('requests a CAPTCHA-protected sign-in link and shows the email guidance', async () => {
    const calls: string[] = [];
    render(
      <AdminLogin
        onRequestCaptcha={async () => {
          calls.push('captcha');
          return 'captcha-token';
        }}
        onRequestSignInLink={async (email, captchaToken) => {
          calls.push(`request:${email}:${captchaToken}`);
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('관리자 이메일'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인 링크 받기' }));
    expect(
      await screen.findByText('관리자 로그인 링크를 보냈습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    await waitFor(() =>
      expect(calls).toEqual([
        'captcha',
        'request:owner@example.com:captcha-token',
      ]),
    );
  });

  it('announces a safe provider failure', async () => {
    render(
      <AdminLogin
        onRequestCaptcha={async () => 'captcha-token'}
        onRequestSignInLink={async () => {
          throw new Error('private provider detail');
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('관리자 이메일'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인 링크 받기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '로그인 링크를 보내지 못했습니다.',
    );
    expect(
      screen.queryByText('private provider detail'),
    ).not.toBeInTheDocument();
  });

  it('does not request a sign-in link when the CAPTCHA challenge fails', async () => {
    const requests: string[] = [];
    render(
      <AdminLogin
        onRequestCaptcha={async () => {
          throw new Error('captcha unavailable');
        }}
        onRequestSignInLink={async (email) => {
          requests.push(email);
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('관리자 이메일'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인 링크 받기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '로그인 링크를 보내지 못했습니다.',
    );
    expect(requests).toEqual([]);
  });
});
