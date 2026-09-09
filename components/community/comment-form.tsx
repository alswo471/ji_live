'use client';

import { useId, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { COMMUNITY_LIMITS, type CommentInput } from '@/lib/community/types';

const EMOJIS = [
  ['😀', '웃는 얼굴'],
  ['😂', '웃음 눈물'],
  ['😊', '미소'],
  ['🤔', '생각 중'],
  ['😢', '우는 얼굴'],
  ['😮', '놀란 얼굴'],
  ['👍', '좋아요'],
  ['👎', '아쉬워요'],
  ['👏', '박수'],
  ['🙏', '감사'],
  ['❤️', '하트'],
  ['🔥', '불꽃'],
] as const;

export function CommentForm({
  onSubmit,
}: {
  onSubmit: (input: CommentInput) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fieldId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const submittingRef = useRef(false);
  const requestId = useRef<string | null>(null);
  function insertEmoji(emoji: string) {
    if (submittingRef.current) return;
    const { start, end } = selection.current;
    const next = body.slice(0, start) + emoji + body.slice(end);
    if (Array.from(next).length > COMMUNITY_LIMITS.commentMax) {
      setError(`댓글은 ${COMMUNITY_LIMITS.commentMax}자 이하로 입력해 주세요.`);
      return;
    }
    setBody(next);
    setError(null);
    requestId.current = null;
    setEmojiOpen(false);
    const caret = start + emoji.length;
    selection.current = { start: caret, end: caret };
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    });
  }
  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!body.trim()) return setError('댓글을 입력해 주세요.');
    if (Array.from(body.trim()).length > COMMUNITY_LIMITS.commentMax)
      return setError(
        `댓글은 ${COMMUNITY_LIMITS.commentMax}자 이하로 입력해 주세요.`,
      );
    submittingRef.current = true;
    setSubmitting(true);
    setEmojiOpen(false);
    setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      await onSubmit({ body: body.trim(), idempotencyKey: requestId.current });
      setBody('');
      selection.current = { start: 0, end: 0 };
      requestId.current = null;
    } catch {
      setError('댓글을 올리지 못했습니다.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={fieldId} className="text-sm font-semibold">
        댓글
      </label>
      <Textarea
        id={fieldId}
        ref={inputRef}
        disabled={submitting}
        aria-describedby={`${fieldId}-count`}
        aria-invalid={!!error}
        value={body}
        onSelect={(event) => {
          selection.current = {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          };
        }}
        onChange={(event) => {
          setBody(event.target.value);
          selection.current = {
            start: event.target.selectionStart,
            end: event.target.selectionEnd,
          };
          requestId.current = null;
        }}
        className="min-h-24"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            ref={emojiButtonRef}
            type="button"
            variant="ghost"
            className="min-h-11"
            aria-label="이모지 선택"
            aria-expanded={emojiOpen}
            aria-controls={`${fieldId}-emoji`}
            disabled={submitting}
            onClick={() => setEmojiOpen((open) => !open)}
          >
            <Smile aria-hidden="true" className="size-4" />
            이모지
          </Button>
          <span
            id={`${fieldId}-count`}
            className="text-xs text-muted-foreground"
          >
            {Array.from(body).length}/{COMMUNITY_LIMITS.commentMax}
          </span>
        </div>
        <Button type="submit" className="min-h-11" disabled={submitting}>
          {submitting ? '올리는 중…' : '댓글 올리기'}
        </Button>
      </div>
      {emojiOpen && (
        <fieldset
          id={`${fieldId}-emoji`}
          aria-label="댓글 이모지"
          className="grid max-w-sm grid-cols-6 gap-1 rounded-xl border bg-muted/30 p-2"
        >
          {EMOJIS.map(([emoji, label]) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              className="min-h-11 rounded-lg text-xl hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => insertEmoji(emoji)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setEmojiOpen(false);
                  emojiButtonRef.current?.focus();
                }
              }}
            >
              {emoji}
            </button>
          ))}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
