'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PostInput } from '@/lib/community/types';

function createRequestId() {
  return globalThis.crypto.randomUUID();
}

export function PostForm({
  onSubmit,
}: {
  onSubmit: (input: PostInput) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (title.trim().length < 2 || title.trim().length > 80) {
      setError('제목은 2–80자로 입력해 주세요.');
      return;
    }
    if (!body.trim() || body.trim().length > 3000) {
      setError('내용은 1–3000자로 입력해 주세요.');
      return;
    }

    setSubmitting(true);
    setError(null);
    requestId.current ??= createRequestId();
    try {
      await onSubmit({
        title: title.trim(),
        body: body.trim(),
        linkUrl: linkUrl.trim() || null,
        idempotencyKey: requestId.current,
      });
      setTitle('');
      setBody('');
      setLinkUrl('');
      requestId.current = null;
    } catch {
      setError('글을 올리지 못했습니다. 같은 요청으로 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black tracking-tight">새 글 작성</h2>
        <span className="text-xs text-muted-foreground">제목 2–80자</span>
      </div>
      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="community-title" className="text-sm font-semibold">
            제목
          </label>
          <Input
            id="community-title"
            className="mt-2 min-h-11"
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-describedby="community-title-count"
          />
          <p
            id="community-title-count"
            className="mt-1 text-right text-xs text-muted-foreground"
          >
            {Array.from(title).length}/80
          </p>
        </div>
        <div>
          <label htmlFor="community-body" className="text-sm font-semibold">
            내용
          </label>
          <Textarea
            id="community-body"
            className="mt-2 min-h-32 resize-y"
            maxLength={3000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-describedby="community-body-count"
          />
          <p
            id="community-body-count"
            className="mt-1 text-right text-xs text-muted-foreground"
          >
            {Array.from(body).length}/3000
          </p>
        </div>
        <div>
          <label htmlFor="community-link" className="text-sm font-semibold">
            참고 링크{' '}
            <span className="font-normal text-muted-foreground">(선택)</span>
          </label>
          <Input
            id="community-link"
            type="url"
            inputMode="url"
            placeholder="https://"
            className="mt-2 min-h-11"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
          />
        </div>
      </div>
      <p className="mt-4 flex gap-2 rounded-xl bg-amber-400/10 p-3 text-xs leading-5 text-amber-950 dark:text-amber-100">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        브라우저 데이터를 삭제하면 이 브라우저에서 작성한 글의 삭제 권한을
        복구할 수 없습니다.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="mt-5 min-h-11 w-full sm:w-auto"
        disabled={submitting}
      >
        <Send aria-hidden="true" />
        {submitting ? '올리는 중…' : '글 올리기'}
      </Button>
    </form>
  );
}
