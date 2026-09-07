import { describe, expect, it } from 'vitest';
import { verifyTurnstile } from '@/lib/community/turnstile';

describe('verifyTurnstile', () => {
  it('returns true only for an explicit successful verification', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify({ success: true, hostname: 'example.com' }), {
        status: 200,
      });

    await expect(
      verifyTurnstile('response-token', '203.0.113.10', {
        fetcher,
        secretKey: 'server-secret',
      }),
    ).resolves.toBe(true);
  });

  it.each([
    new Response(
      JSON.stringify({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
      {
        status: 200,
      },
    ),
    new Response('upstream unavailable', { status: 503 }),
    new Response('{invalid-json', { status: 200 }),
  ])(
    'fails closed for rejected or malformed provider responses',
    async (response) => {
      const fetcher: typeof fetch = async () => response.clone();

      await expect(
        verifyTurnstile('response-token', undefined, {
          fetcher,
          secretKey: 'server-secret',
        }),
      ).resolves.toBe(false);
    },
  );

  it('fails closed when verification exceeds the timeout', async () => {
    const fetcher: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });

    await expect(
      verifyTurnstile('response-token', undefined, {
        fetcher,
        secretKey: 'server-secret',
        timeoutMs: 5,
      }),
    ).resolves.toBe(false);
  });

  it('rejects an empty client response without contacting the provider', async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error('빈 token은 provider에 전송하면 안 됩니다.');
    };

    await expect(
      verifyTurnstile('  ', undefined, {
        fetcher,
        secretKey: 'server-secret',
      }),
    ).resolves.toBe(false);
  });

  it('rejects a response longer than the provider limit', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 });

    await expect(
      verifyTurnstile('a'.repeat(2049), undefined, {
        fetcher,
        secretKey: 'server-secret',
      }),
    ).resolves.toBe(false);
  });
});
