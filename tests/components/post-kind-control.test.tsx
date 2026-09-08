import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostKindControl } from '@/components/community/post-kind-control';
import { useCommunityPostKindPermission } from '@/hooks/use-community-post-kind-permission';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('post kind permission', () => {
  it('surfaces a revoked write permission even after the selector is hidden', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ canManage: true, ready: true }),
    );
    const { result } = renderHook(() =>
      useCommunityPostKindPermission('admin'),
    );
    await waitFor(() => expect(result.current.canManage).toBe(true));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await act(async () => {
      await expect(
        result.current.write(
          '/url',
          'PATCH',
          { kind: 'normal' },
          async () => 'admin',
        ),
      ).rejects.toThrow();
    });
    expect(result.current.canManage).toBe(false);
    expect(result.current.error).toMatch(/권한/);
  });
  it('denies pending, anonymous and revoked permission and ignores stale token replies', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const { result, rerender } = renderHook(
      ({ token }) => useCommunityPostKindPermission(token),
      { initialProps: { token: 'old' as string | null } },
    );
    expect(result.current.canManage).toBe(false);
    rerender({ token: null });
    await act(async () =>
      resolve(Response.json({ canManage: true, ready: true })),
    );
    expect(result.current.canManage).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    rerender({ token: 'new' });
    await waitFor(() => expect(result.current.status).toBe('denied'));
  });
  it('shows missing DB capability separately and rechecks the token before writing', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ canManage: true, ready: false }),
    );
    const { result, rerender } = renderHook(
      ({ token }) => useCommunityPostKindPermission(token),
      { initialProps: { token: 'admin' } },
    );
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.canManage).toBe(false);
    fetchMock.mockResolvedValueOnce(
      Response.json({ canManage: true, ready: true }),
    );
    rerender({ token: 'new-admin' });
    await waitFor(() => expect(result.current.canManage).toBe(true));
    await expect(
      result.current.write(
        '/url',
        'PATCH',
        { kind: 'required' },
        async () => 'different',
      ),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('PostKindControl', () => {
  it('keeps failed selection, blocks duplicate saves and publishes only persisted kind', async () => {
    let reject!: (reason: Error) => void;
    const save = vi.fn(
      () =>
        new Promise<{ kind: 'normal' }>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const changed = vi.fn();
    render(<PostKindControl kind="notice" onSave={save} onChanged={changed} />);
    fireEvent.change(screen.getByLabelText('글 종류'), {
      target: { value: 'normal' },
    });
    const form = screen
      .getByRole('button', { name: '종류 저장' })
      .closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('글 종류')).toBeDisabled();
    await act(async () => reject(new Error()));
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByLabelText('글 종류')).toHaveValue('normal');
    expect(changed).not.toHaveBeenCalled();
    save.mockResolvedValueOnce({ kind: 'normal' });
    fireEvent.submit(form);
    await waitFor(() => expect(changed).toHaveBeenCalledWith('normal'));
    expect(screen.getByRole('status')).toHaveTextContent('저장했습니다');
  });
});
