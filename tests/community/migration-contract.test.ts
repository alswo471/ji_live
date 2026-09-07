import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/202609030001_community_schema.sql', 'utf8');

describe('community migration contract', () => {
  it.each(['community_posts', 'community_comments', 'community_reports', 'community_admins'])(
    'enables RLS on %s',
    (table) => expect(sql).toContain(`alter table public.${table} enable row level security`),
  );

  it('revokes browser write access', () => {
    expect(sql).toContain('revoke insert, update, delete');
    expect(sql).toContain('from anon, authenticated');
  });

  it('keeps ten-report and urgent-hide rules in the database transaction', () => {
    expect(sql).toContain('valid_report_count >= 10');
    expect(sql).toContain("p_reason in ('privacy', 'illegal')");
  });

  it('allows only service_role to execute security definer functions', () => {
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).toContain('to service_role');
  });
});
