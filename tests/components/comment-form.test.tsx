import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CommentForm } from '@/components/community/comment-form';

it('inserts an emoji at the selection without submitting or losing existing text', async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<CommentForm onSubmit={submit} />);
  const input = screen.getByRole('textbox', {
    name: '댓글',
  }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: '앞뒤' } });
  input.focus();
  input.setSelectionRange(1, 1);
  fireEvent.select(input);
  fireEvent.click(screen.getByRole('button', { name: '이모지 선택' }));
  fireEvent.click(screen.getByRole('button', { name: '웃는 얼굴' }));
  expect(input.value).toBe('앞😀뒤');
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '댓글 올리기' }));
  expect(submit).toHaveBeenCalledWith({
    body: '앞😀뒤',
    idempotencyKey: expect.any(String),
  });
  await screen.findByText('0/1000');
});

it('counts emoji as code points and refuses insertion past the server limit', () => {
  render(<CommentForm onSubmit={async () => undefined} />);
  const input = screen.getByRole('textbox', {
    name: '댓글',
  }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: '😀'.repeat(1000) } });
  input.setSelectionRange(input.value.length, input.value.length);
  fireEvent.select(input);
  fireEvent.click(screen.getByRole('button', { name: '이모지 선택' }));
  fireEvent.click(screen.getByRole('button', { name: '웃는 얼굴' }));
  expect(input.value).toBe('😀'.repeat(1000));
  expect(screen.getByRole('alert')).toHaveTextContent('1000');
});

it('locks duplicate submissions and retains text plus request identity after failure', async () => {
  let fail!: (error: Error) => void;
  const submit = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    )
    .mockResolvedValue(undefined);
  render(<CommentForm onSubmit={submit} />);
  const input = screen.getByRole('textbox', { name: '댓글' });
  fireEvent.change(input, { target: { value: '안녕하세요 👍' } });
  const form = input.closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => {
    fail(new Error('network'));
  });
  expect(input).toHaveValue('안녕하세요 👍');
  fireEvent.submit(form);
  expect(submit.mock.calls[1][0].idempotencyKey).toBe(
    submit.mock.calls[0][0].idempotencyKey,
  );
  await screen.findByText('0/1000');
});
