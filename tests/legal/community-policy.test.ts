import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_LEGAL_LINKS,
  COMMUNITY_PRIVACY_SECTIONS,
  COMMUNITY_RETENTION_POLICY,
} from '@/lib/legal/community-policy';

describe('community legal policy', () => {
  it('uses the approved retention periods', () => {
    expect(COMMUNITY_RETENTION_POLICY.abuseKeyHours).toBe(24);
    expect(COMMUNITY_RETENTION_POLICY.deletedContentDays).toBe(30);
    expect(COMMUNITY_RETENTION_POLICY.closedModerationDays).toBe(90);
    expect(COMMUNITY_RETENTION_POLICY.inactiveAnonymousUserDays).toBe(90);
  });

  it('covers every required privacy section', () => {
    expect(COMMUNITY_PRIVACY_SECTIONS.map((section) => section.id)).toEqual(
      expect.arrayContaining([
        'purpose',
        'items',
        'legal-basis',
        'retention',
        'destruction',
        'rights',
        'security',
        'processor',
        'overseas-processing',
        'contact',
      ]),
    );
  });

  it('defines stable routes for every footer policy', () => {
    expect(COMMUNITY_LEGAL_LINKS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: '/legal/privacy' }),
        expect.objectContaining({ href: '/legal/terms' }),
        expect.objectContaining({ href: '/legal/community-guidelines' }),
        expect.objectContaining({ href: '/legal/rights' }),
      ]),
    );
  });
});
