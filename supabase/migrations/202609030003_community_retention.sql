create table public.community_legal_holds (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (
    subject_type in ('post', 'comment', 'report', 'moderation_action', 'user')
  ),
  subject_id uuid not null,
  reason text not null check (char_length(reason) between 5 and 500),
  created_by uuid not null references public.community_admins(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  ends_at timestamptz,
  released_at timestamptz
);

create index community_legal_holds_active_subject_idx
  on public.community_legal_holds (subject_type, subject_id)
  where released_at is null;

alter table public.community_legal_holds enable row level security;
alter table public.community_legal_holds force row level security;
revoke all on public.community_legal_holds from anon, authenticated;

create or replace function public.run_community_retention(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  eligible_posts uuid[];
  eligible_comments uuid[];
  rate_count integer := 0;
  post_count integer := 0;
  comment_count integer := 0;
  report_count integer := 0;
  moderation_count integer := 0;
  user_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('community-retention', 0));

  delete from public.community_rate_events
  where created_at < p_now - interval '24 hours';
  get diagnostics rate_count = row_count;

  select coalesce(array_agg(p.id), '{}'::uuid[])
  into eligible_posts
  from public.community_posts p
  where p.status = 'deleted'
    and p.deleted_at < p_now - interval '30 days'
    and not exists (
      select 1 from public.community_legal_holds h
      where h.subject_type = 'post' and h.subject_id = p.id
        and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    )
    and not exists (
      select 1
      from public.community_comments c
      join public.community_legal_holds h
        on h.subject_type = 'comment' and h.subject_id = c.id
      where c.post_id = p.id and h.released_at is null
        and (h.ends_at is null or h.ends_at > p_now)
    )
    and not exists (
      select 1
      from public.community_reports r
      join public.community_legal_holds h
        on h.subject_type = 'report' and h.subject_id = r.id
      where (r.post_id = p.id or r.comment_id in (
        select id from public.community_comments where post_id = p.id
      )) and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    )
    and not exists (
      select 1
      from public.community_moderation_actions a
      join public.community_legal_holds h
        on h.subject_type = 'moderation_action' and h.subject_id = a.id
      where (a.post_id = p.id or a.comment_id in (
        select id from public.community_comments where post_id = p.id
      )) and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    );

  select coalesce(array_agg(c.id), '{}'::uuid[])
  into eligible_comments
  from public.community_comments c
  where (
      (c.status = 'deleted' and c.deleted_at < p_now - interval '30 days')
      or c.post_id = any(eligible_posts)
    )
    and not exists (
      select 1 from public.community_legal_holds h
      where h.subject_type = 'comment' and h.subject_id = c.id
        and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    )
    and not exists (
      select 1
      from public.community_reports r
      join public.community_legal_holds h
        on h.subject_type = 'report' and h.subject_id = r.id
      where r.comment_id = c.id and h.released_at is null
        and (h.ends_at is null or h.ends_at > p_now)
    )
    and not exists (
      select 1
      from public.community_moderation_actions a
      join public.community_legal_holds h
        on h.subject_type = 'moderation_action' and h.subject_id = a.id
      where a.comment_id = c.id and h.released_at is null
        and (h.ends_at is null or h.ends_at > p_now)
    );

  delete from public.community_reports r
  where (
      r.post_id = any(eligible_posts)
      or r.comment_id = any(eligible_comments)
      or (
        r.status <> 'open'
        and r.resolved_at < p_now - interval '90 days'
      )
    )
    and not exists (
      select 1 from public.community_legal_holds h
      where h.subject_type = 'report' and h.subject_id = r.id
        and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    );
  get diagnostics report_count = row_count;

  delete from public.community_moderation_actions a
  where (
      a.post_id = any(eligible_posts)
      or a.comment_id = any(eligible_comments)
      or a.created_at < p_now - interval '90 days'
    )
    and not exists (
      select 1 from public.community_legal_holds h
      where h.subject_type = 'moderation_action' and h.subject_id = a.id
        and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    );
  get diagnostics moderation_count = row_count;

  delete from public.community_comments
  where id = any(eligible_comments);
  get diagnostics comment_count = row_count;

  delete from public.community_posts
  where id = any(eligible_posts);
  get diagnostics post_count = row_count;

  delete from auth.users u
  where u.is_anonymous = true
    and coalesce(u.last_sign_in_at, u.created_at) < p_now - interval '90 days'
    and not exists (select 1 from public.community_posts p where p.author_id = u.id)
    and not exists (select 1 from public.community_comments c where c.author_id = u.id)
    and not exists (select 1 from public.community_reports r where r.reporter_id = u.id)
    and not exists (select 1 from public.community_sanctions s where s.user_id = u.id)
    and not exists (select 1 from public.community_moderation_actions a where a.user_id = u.id)
    and not exists (select 1 from public.community_admins a where a.user_id = u.id)
    and not exists (
      select 1 from public.community_legal_holds h
      where h.subject_type = 'user' and h.subject_id = u.id
        and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    );
  get diagnostics user_count = row_count;

  return jsonb_build_object(
    'rateEvents', rate_count,
    'posts', post_count,
    'comments', comment_count,
    'reports', report_count,
    'moderationActions', moderation_count,
    'anonymousUsers', user_count
  );
end;
$$;

revoke all on function public.run_community_retention(timestamptz)
  from public, anon, authenticated;
grant execute on function public.run_community_retention(timestamptz)
  to service_role;
