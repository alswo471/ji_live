import { createCommunityHmac, CommunitySecurityError } from './abuse-key';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADJECTIVES = [
  '차분한',
  '반짝이는',
  '용감한',
  '다정한',
  '신중한',
  '명랑한',
  '느긋한',
  '재빠른',
];
const ANIMALS = [
  '고양이',
  '토끼',
  '여우',
  '수달',
  '참새',
  '판다',
  '다람쥐',
  '고슴도치',
];

function indexFromHash(hash: string, start: number, length: number) {
  return Number.parseInt(hash.slice(start, start + length), 16);
}

export async function createAnonymousName(actorId: string): Promise<string> {
  const normalizedActorId = actorId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalizedActorId)) {
    throw new CommunitySecurityError(
      'invalid_actor_id',
      '익명 사용자 정보를 확인하지 못했습니다.',
    );
  }

  const hash = await createCommunityHmac(`nickname:${normalizedActorId}`);
  const adjective = ADJECTIVES[indexFromHash(hash, 0, 8) % ADJECTIVES.length];
  const animal = ANIMALS[indexFromHash(hash, 8, 8) % ANIMALS.length];
  const digits = String(indexFromHash(hash, 16, 8) % 10_000).padStart(4, '0');

  return `${adjective}-${animal}-${digits}`;
}
