import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/202609030002_community_moderation.sql',
  'utf8',
).toLowerCase();

describe('community moderation migration', () => {
  it('keeps content state, open report resolution and audit insert in one RPC transaction', () => {
    expect(sql).toContain(
      'create or replace function public.moderate_community_content',
    );
    expect(sql).toContain('update public.community_reports');
    expect(sql).toContain('insert into public.community_moderation_actions');
    expect(sql).toContain('insert into public.community_sanctions');
  });

  it('allows only service_role to execute the moderation RPC', () => {
    expect(sql).toContain(
      'revoke all on function public.moderate_community_content',
    );
    expect(sql).toContain(
      'grant execute on function public.moderate_community_content',
    );
    expect(sql).toContain('to service_role');
  });
});
