import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDisplayPreferences } from '@/hooks/use-display-preferences';

describe('useDisplayPreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it('저장값이 없으면 운영체제 다크 테마를 적용한다', async () => {
    const { result } = renderHook(() => useDisplayPreferences());
    await waitFor(() => expect(result.current.theme).toBe('dark'));
    expect(document.documentElement).toHaveClass('dark');
  });

  it('사용자가 고른 테마와 종목명 표기를 저장한다', async () => {
    const { result } = renderHook(() => useDisplayPreferences());
    await act(async () => {
      result.current.setTheme('light');
      result.current.setNameLocale('en');
    });
    expect(window.localStorage.getItem('g2-live-theme')).toBe('light');
    expect(window.localStorage.getItem('g2-live-name-locale')).toBe('en');
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
