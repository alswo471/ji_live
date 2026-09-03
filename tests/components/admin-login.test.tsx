import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminLogin } from '@/components/community/admin-login';

describe('AdminLogin', () => {
  it('requests an OTP and verifies the code through labeled forms', async () => {
    const calls: string[] = [];
    render(
      <AdminLogin
        onRequestOtp={async (email) => {
          calls.push(`request:${email}`);
        }}
        onVerifyOtp={async (email, token) => {
          calls.push(`verify:${email}:${token}`);
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('관리자 이메일'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    await screen.findByLabelText('이메일 인증번호');

    fireEvent.change(screen.getByLabelText('이메일 인증번호'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: '관리자로 로그인' }));

    await waitFor(() =>
      expect(calls).toEqual([
        'request:owner@example.com',
        'verify:owner@example.com:123456',
      ]),
    );
  });

  it('announces a safe provider failure', async () => {
    render(
      <AdminLogin
        onRequestOtp={async () => {
          throw new Error('private provider detail');
        }}
        onVerifyOtp={async () => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('관리자 이메일'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '인증번호를 보내지 못했습니다.',
    );
    expect(
      screen.queryByText('private provider detail'),
    ).not.toBeInTheDocument();
  });
});
