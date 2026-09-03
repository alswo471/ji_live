import { describe, expect, it } from 'vitest';
import {
  CommunityInputError,
  validateCommentInput,
  validatePostInput,
  validateReportInput,
} from '@/lib/community/validation';

const POST_IDEMPOTENCY_KEY = '10000000-0000-4000-8000-000000000001';
const TARGET_ID = '20000000-0000-4000-8000-000000000001';

function expectInputError(run: () => unknown, code: string) {
  try {
    run();
    throw new Error('입력 오류가 발생해야 합니다.');
  } catch (error) {
    expect(error).toBeInstanceOf(CommunityInputError);
    expect(error).toMatchObject({ code });
  }
}

describe('validatePostInput', () => {
  it('trims outer whitespace while preserving internal line breaks', () => {
    expect(
      validatePostInput({
        title: '  오늘의 시장 질문  ',
        body: '\n첫 번째 줄\n  두 번째 줄  \n',
        linkUrl: '  https://example.com/article  ',
        idempotencyKey: POST_IDEMPOTENCY_KEY,
      }),
    ).toEqual({
      title: '오늘의 시장 질문',
      body: '첫 번째 줄\n  두 번째 줄',
      linkUrl: 'https://example.com/article',
      idempotencyKey: POST_IDEMPOTENCY_KEY,
    });
  });

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="https://example.com">링크</a>',
  ])('rejects HTML markup in plain text: %s', (body) => {
    expectInputError(
      () =>
        validatePostInput({
          title: 'HTML 차단',
          body,
          linkUrl: null,
          idempotencyKey: POST_IDEMPOTENCY_KEY,
        }),
      'html_not_allowed',
    );
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'http://example.com',
  ])('rejects a non-HTTPS link: %s', (linkUrl) => {
    expectInputError(
      () =>
        validatePostInput({
          title: '링크 검사',
          body: '안전한 링크만 허용합니다.',
          linkUrl,
          idempotencyKey: POST_IDEMPOTENCY_KEY,
        }),
      'invalid_link',
    );
  });

  it.each([
    'https://bit.ly/example',
    'https://t.co/example',
    'https://tinyurl.com/example',
  ])('rejects a known URL shortener: %s', (linkUrl) => {
    expectInputError(
      () =>
        validatePostInput({
          title: '단축 URL 차단',
          body: '최종 목적지를 확인할 수 있어야 합니다.',
          linkUrl,
          idempotencyKey: POST_IDEMPOTENCY_KEY,
        }),
      'shortened_link_not_allowed',
    );
  });

  it('rejects more than one URL across the body and link field', () => {
    expectInputError(
      () =>
        validatePostInput({
          title: '링크 개수 제한',
          body: '본문 링크 https://one.example/path',
          linkUrl: 'https://two.example/path',
          idempotencyKey: POST_IDEMPOTENCY_KEY,
        }),
      'too_many_links',
    );
  });

  it('rejects an invalid idempotency UUID', () => {
    expectInputError(
      () =>
        validatePostInput({
          title: '중복 제출 방지',
          body: '올바른 요청 식별자가 필요합니다.',
          linkUrl: null,
          idempotencyKey: 'not-a-uuid',
        }),
      'invalid_idempotency_key',
    );
  });

  it('rejects text outside the supported lengths', () => {
    expectInputError(
      () =>
        validatePostInput({
          title: '한',
          body: 'a'.repeat(3001),
          linkUrl: null,
          idempotencyKey: POST_IDEMPOTENCY_KEY,
        }),
      'invalid_title_length',
    );
  });
});

describe('validateCommentInput', () => {
  it('rejects oversized comments', () => {
    expectInputError(
      () =>
        validateCommentInput({
          body: '가'.repeat(1001),
          idempotencyKey: POST_IDEMPOTENCY_KEY,
        }),
      'invalid_comment_length',
    );
  });
});

describe('validateReportInput', () => {
  it('rejects an unknown report reason', () => {
    expectInputError(
      () =>
        validateReportInput({
          targetType: 'post',
          targetId: TARGET_ID,
          reason: 'dislike',
          detail: '',
        }),
      'invalid_report_reason',
    );
  });

  it('returns a trimmed supported report', () => {
    expect(
      validateReportInput({
        targetType: 'comment',
        targetId: TARGET_ID,
        reason: 'privacy',
        detail: '  전화번호가 노출되어 있습니다.  ',
      }),
    ).toEqual({
      targetType: 'comment',
      targetId: TARGET_ID,
      reason: 'privacy',
      detail: '전화번호가 노출되어 있습니다.',
    });
  });
});
