import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceChange } from '@/components/market/price-change';

describe('PriceChange', () => {
  it('상승률을 빨강과 양수 부호로 표시한다', () => {
    render(<PriceChange value={0.0124} />);
    expect(screen.getByText('+1.24%')).toHaveClass('text-rise');
  });

  it('하락률을 파랑과 음수 부호로 표시한다', () => {
    render(<PriceChange value={-0.0082} />);
    expect(screen.getByText('-0.82%')).toHaveClass('text-fall');
  });

  it('등락률이 없으면 집계 중이라고 표시한다', () => {
    render(<PriceChange value={null} />);
    expect(screen.getByText('집계 중')).toHaveClass('text-muted-foreground');
  });
});
