import { isCommunityEnabled } from '@/lib/community/config';
import { getServerSupabase } from '@/lib/community/supabase';

export const dynamic = 'force-dynamic';

export type CommunityRetentionCounts = {
  rateEvents: number;
  posts: number;
  comments: number;
  reports: number;
  moderationActions: number;
  anonymousUsers: number;
};

export interface CommunityRetentionDependencies {
  enabled: () => boolean;
  secret: () => string;
  runRetention: () => Promise<CommunityRetentionCounts>;
}

function safeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const size = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < size; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function parseCounts(value: unknown): CommunityRetentionCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid retention result');
  }
  const row = value as Record<string, unknown>;
  const keys = [
    'rateEvents',
    'posts',
    'comments',
    'reports',
    'moderationActions',
    'anonymousUsers',
  ] as const;
  return Object.fromEntries(
    keys.map((key) => {
      const count = row[key];
      if (!Number.isInteger(count) || Number(count) < 0) {
        throw new Error('invalid retention result');
      }
      return [key, count];
    }),
  ) as CommunityRetentionCounts;
}

const dependencies: CommunityRetentionDependencies = {
  enabled: isCommunityEnabled,
  secret: () => process.env.COMMUNITY_RETENTION_SECRET ?? '',
  runRetention: async () => {
    const { data, error } = await getServerSupabase().rpc(
      'run_community_retention',
    );
    if (error) throw new Error('community retention failed');
    return parseCounts(data);
  },
};

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function handleCommunityRetentionRequest(
  request: Request,
  deps: CommunityRetentionDependencies = dependencies,
) {
  if (!deps.enabled())
    return json({ error: '페이지를 찾을 수 없습니다.' }, 404);
  const configuredSecret = deps.secret();
  const authorization = request.headers.get('authorization') ?? '';
  const suppliedSecret = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  if (
    configuredSecret.length < 32 ||
    suppliedSecret.length === 0 ||
    !safeEqual(configuredSecret, suppliedSecret)
  ) {
    return json({ error: '자동 파기 요청을 인증하지 못했습니다.' }, 401);
  }
  try {
    return json(await deps.runRetention(), 200);
  } catch {
    return json({ error: '자동 파기 작업을 완료하지 못했습니다.' }, 503);
  }
}

export async function POST(request: Request) {
  return handleCommunityRetentionRequest(request);
}
