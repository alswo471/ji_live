import { describe, expect, it } from 'vitest';
import {
  CommunityAdminActorLabelError,
  createAdminActorLabel,
} from '@/lib/community/admin-actor-label';

const USER_ID = '30000000-0000-4000-8000-000000000001';
const SECRET = 'test-secret-at-least-32-characters';

describe('createAdminActorLabel', () => {
  it('creates a stable label without exposing the UUID', () => {
    const label = createAdminActorLabel(USER_ID, SECRET);

    expect(label).toMatch(/^익명 사용자 #[A-F0-9]{4}$/);
    expect(label).not.toContain(USER_ID);
    expect(createAdminActorLabel(USER_ID, SECRET)).toBe(label);
  });

  it.each([undefined, 'short-secret'])(
    'rejects an unavailable secret without exposing its value: %s',
    (secret) => {
      expect(() => createAdminActorLabel(USER_ID, secret)).toThrow(
        CommunityAdminActorLabelError,
      );

      try {
        createAdminActorLabel(USER_ID, secret);
      } catch (error) {
        expect(error).toMatchObject({
          status: 503,
          code: 'admin_actor_label_unavailable',
          message: '관리자 사용자 정보를 표시하지 못했습니다.',
        });
        expect(String(error)).not.toContain(secret ?? 'undefined');
      }
    },
  );
});
