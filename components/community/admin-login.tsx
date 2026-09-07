'use client';

import { useState } from 'react';
import { CheckCircle2, KeyRound, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AdminLogin({
  onRequestCaptcha,
  onRequestSignInLink,
}: {
  onRequestCaptcha: () => Promise<string>;
  onRequestSignInLink: (email: string, captchaToken: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
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
      const captchaToken = await onRequestCaptcha();
      await onRequestSignInLink(normalizedEmail, captchaToken);
      setEmail(normalizedEmail);
      setLinkSent(true);
    } catch {
      setError('로그인 링크를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
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

      {!linkSent ? (
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
            {submitting ? '전송 중…' : '로그인 링크 받기'}
          </Button>
        </form>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="flex items-center gap-2 font-bold text-primary">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              관리자 로그인 링크를 보냈습니다.
            </p>
            <p className="mt-2 break-all text-sm font-semibold">{email}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              메일의 Sign in 버튼을 누르면 이 관리자 화면으로 돌아옵니다. 링크는
              잠시 후 만료되며 한 번만 사용할 수 있습니다.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full"
            onClick={() => {
              setLinkSent(false);
              setError(null);
            }}
          >
            이메일 다시 입력
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
