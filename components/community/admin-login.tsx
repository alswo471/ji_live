'use client';

import { useState } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AdminLogin({
  onRequestOtp,
  onVerifyOtp,
}: {
  onRequestOtp: (email: string) => Promise<void>;
  onVerifyOtp: (email: string, token: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestOtp(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('관리자 이메일을 확인해 주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onRequestOtp(normalizedEmail);
      setEmail(normalizedEmail);
      setOtpSent(true);
    } catch {
      setError('인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedToken = token.trim();
    if (!/^\d{6}$/.test(normalizedToken)) {
      setError('6자리 이메일 인증번호를 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onVerifyOtp(email, normalizedToken);
    } catch {
      setError(
        '인증번호를 확인하지 못했습니다. 새 번호를 받아 다시 시도해 주세요.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <KeyRound aria-hidden="true" className="size-5" />
      </div>
      <h1 className="mt-5 text-2xl font-black tracking-tight">
        Community 관리
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        등록된 운영자 계정만 접근할 수 있습니다. 인증정보는 관리 API 응답이나
        운영 로그에 포함하지 않습니다.
      </p>

      {!otpSent ? (
        <form className="mt-6 space-y-4" onSubmit={requestOtp}>
          <label htmlFor="admin-email" className="block text-sm font-semibold">
            관리자 이메일
          </label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-11 pl-10"
              required
            />
          </div>
          <Button
            type="submit"
            className="min-h-11 w-full"
            disabled={submitting}
          >
            {submitting ? '전송 중…' : '인증번호 받기'}
          </Button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={verifyOtp}>
          <label htmlFor="admin-otp" className="block text-sm font-semibold">
            이메일 인증번호
          </label>
          <Input
            id="admin-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={token}
            onChange={(event) =>
              setToken(event.target.value.replace(/\D/g, ''))
            }
            className="min-h-11 text-center text-lg tracking-[.35em]"
            required
          />
          <Button
            type="submit"
            className="min-h-11 w-full"
            disabled={submitting}
          >
            {submitting ? '확인 중…' : '관리자로 로그인'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full"
            onClick={() => {
              setOtpSent(false);
              setToken('');
              setError(null);
            }}
          >
            이메일 다시 입력
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
