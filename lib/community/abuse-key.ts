import { getCommunityServerConfig } from './config';

const IPV4_PART_PATTERN = /^[0-9]{1,3}$/;
const IPV6_PATTERN = /^[0-9a-f:]+$/i;

export class CommunitySecurityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunitySecurityError';
  }
}

function normalizeIpv4(value: string) {
  const parts = value.split('.');
  if (
    parts.length !== 4 ||
    parts.some((part) => !IPV4_PART_PATTERN.test(part) || Number(part) > 255)
  ) {
    return null;
  }
  return parts.map((part) => String(Number(part))).join('.');
}

function normalizeIpv6(value: string) {
  const lower = value.toLowerCase();
  if (
    !IPV6_PATTERN.test(lower) ||
    !lower.includes(':') ||
    lower.includes(':::')
  )
    return null;

  const compressionCount = lower.split('::').length - 1;
  if (compressionCount > 1) return null;

  const groups = lower.split(':').filter(Boolean);
  if (groups.some((group) => group.length > 4)) return null;
  if (compressionCount === 0 && groups.length !== 8) return null;
  if (compressionCount === 1 && groups.length >= 8) return null;

  return lower;
}

function normalizeClientIp(value: string) {
  const trimmed = value.trim().replace(/^\[|\]$/g, '');
  const normalized = trimmed.includes(':')
    ? normalizeIpv6(trimmed)
    : normalizeIpv4(trimmed);
  if (!normalized) {
    throw new CommunitySecurityError(
      'invalid_client_ip',
      '요청 출처를 확인하지 못했습니다.',
    );
  }
  return normalized;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export async function createCommunityHmac(input: string) {
  const secret = getCommunityServerConfig().communityHmacSecret;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(input),
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function createDailyAbuseKey(
  ip: string,
  now: Date = new Date(),
): Promise<string> {
  if (Number.isNaN(now.getTime())) {
    throw new CommunitySecurityError(
      'invalid_abuse_key_date',
      '요청 시각을 확인하지 못했습니다.',
    );
  }

  const day = now.toISOString().slice(0, 10);
  return createCommunityHmac(`${day}:${normalizeClientIp(ip)}`);
}
