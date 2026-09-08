import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostForm } from '@/components/community/post-form';

describe('PostForm', () => {
  it('only shows kind choices after permission and retains kind and input on failure', async () => {
    const submit = vi.fn().mockRejectedValue(new Error());
    const { rerender } = render(<PostForm onSubmit={submit} />);
    expect(
      screen.queryByRole('combobox', { name: '글 종류' }),
    ).not.toBeInTheDocument();
    rerender(<PostForm onSubmit={submit} canManageKind />);
    fireEvent.change(screen.getByLabelText('글 종류'), {
      target: { value: 'required' },
    });
    fireEvent.change(screen.getByLabelText('제목'), {
      target: { value: '필독 제목' },
    });
    fireEvent.change(screen.getByLabelText('내용'), {
      target: { value: '필독 내용' },
    });
    fireEvent.click(screen.getByRole('button', { name: '글 올리기' }));
    await screen.findByRole('alert');
    expect(submit.mock.calls[0][0].kind).toBe('required');
    expect(screen.getByLabelText('글 종류')).toHaveValue('required');
    expect(screen.getByLabelText('제목')).toHaveValue('필독 제목');
  });
  it('suppresses synchronous duplicate submissions and disables the selector', async () => {
    let resolve!: () => void;
    const submit = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    render(<PostForm onSubmit={submit} canManageKind />);
    fireEvent.change(screen.getByLabelText('제목'), {
      target: { value: '공지 제목' },
    });
    fireEvent.change(screen.getByLabelText('내용'), {
      target: { value: '내용' },
    });
    const form = screen
      .getByRole('button', { name: '글 올리기' })
      .closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('글 종류')).toBeDisabled();
    resolve();
    await waitFor(() =>
      expect(screen.getByLabelText('글 종류')).not.toBeDisabled(),
    );
  });
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
