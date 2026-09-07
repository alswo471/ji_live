import { describe, expect, it } from 'vitest';
import {
  parseReferenceFx,
  parseFrankfurterFx,
} from '@/lib/market/reference-fx';

const now = Date.parse('2026-09-07T03:00:00Z');
const day = (
  date: string,
  krw = '1500',
  usd = '1.2',
  jpy = '150',
  thb = '40',
) =>
  `<Cube time="${date}"><Cube currency="KRW" rate="${krw}"/><Cube currency="USD" rate="${usd}"/><Cube currency="JPY" rate="${jpy}"/><Cube currency="THB" rate="${thb}"/></Cube>`;
const xml = (days: string) => `<Envelope><Cube>${days}</Cube></Envelope>`;

describe('ECB 기준환율 교차계산', () => {
  it('대체 경로에서도 동일 발표일의 ECB 통화값만 계산한다', () => {
    const rows = Object.entries({ KRW: 1500, USD: 1.2, JPY: 150, THB: 40 }).map(
      ([quote, rate]) => ({ date: '2026-09-04', base: 'EUR', quote, rate }),
    );
    expect(parseFrankfurterFx(rows, now)).toEqual(
      parseReferenceFx(xml(day('2026-09-04')), now),
    );
    expect(() => parseFrankfurterFx(rows.slice(1), now)).toThrow();
    expect(() => parseFrankfurterFx([...rows, rows[0]], now)).toThrow();
    expect(() =>
      parseFrankfurterFx(
        rows.map((row) => ({ ...row, base: 'USD' })),
        now,
      ),
    ).toThrow();
  });
  it('주말에는 마지막 발표일을 유지하며 직전 발표일과 비교한다', () => {
    const result = parseReferenceFx(
      xml(day('2026-09-04') + day('2026-09-03', '1440')),
      now,
    );
    expect(result).toMatchObject({
      date: '2026-09-04',
      previousDate: '2026-09-03',
      rates: [
        { currency: 'USD', unit: 1, price: 1250, previousPrice: 1200 },
        { currency: 'JPY', unit: 100, price: 1000, previousPrice: 960 },
        { currency: 'THB', unit: 1, price: 37.5, previousPrice: 36 },
      ],
    });
    expect(
      (result as { rates: { changeRate: number }[] }).rates[0].changeRate,
    ).toBeCloseTo(1 / 24);
  });
  it('입력 순서와 무관하게 최신 두 발표일을 선택한다', () => {
    expect(
      parseReferenceFx(xml(day('2026-09-03') + day('2026-09-04')), now),
    ).toMatchObject({ date: '2026-09-04' });
  });
  it('이전 발표값이 없으면 등락률을 만들지 않는다', () => {
    expect(parseReferenceFx(xml(day('2026-09-04')), now)).toMatchObject({
      previousDate: null,
      rates: [{ changeRate: null }, { changeRate: null }, { changeRate: null }],
    });
  });
  it.each(['0', '-1', 'NaN', '', 'Infinity'])(
    '잘못된 환율 %s를 거부한다',
    (rate) => {
      expect(() =>
        parseReferenceFx(xml(day('2026-09-04', '1500', rate)), now),
      ).toThrow();
    },
  );
  it('누락된 통화·중복 발표일·미래일·잘못된 날짜·오래된 원본을 거부한다', () => {
    for (const input of [
      xml(day('2026-09-04').replace('<Cube currency="JPY" rate="150"/>', '')),
      xml(day('2026-09-04') + day('2026-09-04')),
      xml(day('2026-09-08')),
      xml(day('2026-02-30')),
      xml(day('2026-08-01')),
      '<!DOCTYPE data SYSTEM="https://example.com">' + xml(day('2026-09-04')),
    ])
      expect(() => parseReferenceFx(input, now)).toThrow();
  });
});
