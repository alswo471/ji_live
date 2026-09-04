import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/202609040003_community_final_review_fixes.sql',
  'utf8',
).toLowerCase();

describe('community final review forward migration', () => {
  it('expires and scrubs report abuse keys within 24 hours', () => {
    expect(sql).toContain('reporter_abuse_key_expires_at');
    expect(sql).toContain('reporter_abuse_key = null');
    expect(sql).toContain("interval '24 hours'");
  });

  it('purges an eligible deleted parent graph without shortening dependent retention', () => {
    expect(sql).toContain('dependent_comments');
    expect(sql).toContain('eligible_posts');
    expect(sql).toContain('c.purge_at > p_now');
    expect(sql).toContain("r.resolved_at <= p_now - interval '1 year'");
    expect(sql).toContain("a.created_at <= p_now - interval '1 year'");
  });

  it('uses revoke time or natural end time as the sanction terminal time', () => {
    expect(sql).toContain('coalesce(s.revoked_at, s.ends_at)');
  });

  it('adds terminal moderation transitions and hidden metadata', () => {
    expect(sql).toContain("'dismiss'");
    expect(sql).toContain('p_report_id uuid');
    expect(sql).toContain('hidden_source');
    expect(sql).toContain('hidden_reason');
    expect(sql).toContain('hidden_at');
    expect(sql).toContain('target_title_snapshot');
    expect(sql).toContain('target_body_snapshot');
  });

  it('keeps the replacement RPCs service-role only', () => {
    expect(sql).toContain(
      'revoke all on function public.moderate_community_content(uuid, text, text, uuid, uuid, timestamptz, text, uuid)',
    );
    expect(sql).toContain('to service_role');
    expect(sql).toContain('revoke all on public.community_admin_content');
  });
});
