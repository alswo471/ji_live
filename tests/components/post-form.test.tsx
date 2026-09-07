import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostForm } from '@/components/community/post-form';

describe('PostForm', () => {
  it('shows limits and the browser-data-loss ownership warning', () => {
    render(<PostForm onSubmit={vi.fn()} />);
    expect(screen.getByText(/2–80자/)).toBeInTheDocument();
    expect(screen.getByText(/0\/3000/)).toBeInTheDocument();
    expect(screen.getByText(/브라우저 데이터를 삭제하면/)).toBeInTheDocument();
  });

  it('keeps one idempotency key while a failed request is retried', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined);
    render(<PostForm onSubmit={submit} />);
    fireEvent.change(screen.getByLabelText('제목'), {
      target: { value: '시장 질문' },
    });
    fireEvent.change(screen.getByLabelText('내용'), {
      target: { value: '오늘 시장은 어떤가요?' },
    });
    fireEvent.click(screen.getByRole('button', { name: '글 올리기' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '글 올리기' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[0][0].idempotencyKey).toBe(
      submit.mock.calls[1][0].idempotencyKey,
    );
  });
});
