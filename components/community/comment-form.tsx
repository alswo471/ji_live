'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CommentInput } from '@/lib/community/types';

export function CommentForm({
  onSubmit,
}: {
  onSubmit: (input: CommentInput) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!body.trim()) return setError('댓글을 입력해 주세요.');
    setSubmitting(true);
    setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      await onSubmit({ body: body.trim(), idempotencyKey: requestId.current });
      setBody('');
      requestId.current = null;
    } catch {
      setError('댓글을 올리지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="comment-body" className="text-sm font-semibold">
        댓글
      </label>
      <Textarea
        id="comment-body"
        maxLength={1000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        className="min-h-24"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {Array.from(body).length}/1000
        </span>
        <Button type="submit" className="min-h-11" disabled={submitting}>
          {submitting ? '올리는 중…' : '댓글 올리기'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
