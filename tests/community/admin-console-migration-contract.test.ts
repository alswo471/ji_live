import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/202609040001_community_admin_console.sql',
  'utf8',
).toLowerCase();

const retentionSql = readFileSync(
  'supabase/migrations/202609040002_community_one_year_retention.sql',
  'utf8',
).toLowerCase();

describe('community admin console migration', () => {
  it('records delete source and one-year purge time', () => {
    expect(sql).toContain('deletion_source');
    expect(sql).toContain('purge_at');
    expect(sql).toContain("interval '1 year'");
  });

  it('keeps author delete and admin moderation in service-role transactions', () => {
    expect(sql).toContain('delete_community_content_by_author');
    expect(sql).toContain('moderate_community_content');
    expect(sql).toContain('revoke_community_sanction');
    expect(sql).toContain('to service_role');
  });

  it('does not grant the admin content view to browser roles', () => {
    expect(sql).toContain('community_admin_content');
    expect(sql).toContain(
      'revoke all on public.community_admin_content from anon, authenticated',
    );
  });

  it('uses one-year purge boundaries for protected retention records', () => {
    expect(retentionSql).toContain('p.purge_at <= p_now');
    expect(retentionSql).toContain('c.purge_at <= p_now');
    expect(retentionSql).toContain("interval '1 year'");
    expect(retentionSql).toContain('s.revoked_at is not null');
    expect(retentionSql).toContain("'sanctions'");
  });
});
