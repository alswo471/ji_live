import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DisplayControls } from '@/components/market/display-controls';

describe('DisplayControls', () => {
  it('테마와 종목명 표기를 접근 가능한 버튼으로 전환한다', async () => {
    const user = userEvent.setup();
    const setTheme = vi.fn();
    const setNameLocale = vi.fn();
    render(<DisplayControls theme="dark" nameLocale="ko" setTheme={setTheme} setNameLocale={setNameLocale} />);

    await user.click(screen.getByRole('button', { name: '라이트 모드로 전환' }));
    await user.click(screen.getByRole('button', { name: '영문명으로 보기' }));

    expect(setTheme).toHaveBeenCalledWith('light');
    expect(setNameLocale).toHaveBeenCalledWith('en');
  });
});
