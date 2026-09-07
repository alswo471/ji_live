create type public.community_content_status as enum ('visible', 'hidden', 'deleted');
create type public.community_report_reason as enum (
  'privacy',
  'illegal',
  'copyright',
  'harassment',
  'spam',
  'financial_solicitation',
  'other'
);
create type public.community_report_status as enum ('open', 'resolved', 'dismissed');

create table public.community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete restrict,
  author_name text not null check (char_length(author_name) between 2 and 24),
  title text not null check (char_length(title) between 2 and 80),
  body text not null check (char_length(body) between 1 and 3000),
  link_url text check (link_url is null or link_url ~ '^https://'),
  idempotency_key uuid not null unique,
  status public.community_content_status not null default 'visible',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint community_posts_deleted_at_check check (
    (status = 'deleted' and deleted_at is not null)
    or (status <> 'deleted' and deleted_at is null)
  )
);

create index community_posts_visible_created_idx
  on public.community_posts (created_at desc, id desc)
  where status = 'visible';

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  author_name text not null check (char_length(author_name) between 2 and 24),
  body text not null check (char_length(body) between 1 and 1000),
  idempotency_key uuid not null unique,
  status public.community_content_status not null default 'visible',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint community_comments_deleted_at_check check (
    (status = 'deleted' and deleted_at is not null)
    or (status <> 'deleted' and deleted_at is null)
  )
);

create index community_comments_visible_post_created_idx
  on public.community_comments (post_id, created_at asc, id asc)
  where status = 'visible';

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete restrict,
  reporter_abuse_key text not null check (char_length(reporter_abuse_key) = 64),
  post_id uuid references public.community_posts(id) on delete restrict,
  comment_id uuid references public.community_comments(id) on delete restrict,
  reason public.community_report_reason not null,
  detail text not null default '' check (char_length(detail) <= 500),
  status public.community_report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint community_reports_one_target_check check (
    (post_id is not null and comment_id is null)
    or (post_id is null and comment_id is not null)
  ),
  constraint community_reports_resolution_check check (
    (status = 'open' and resolved_at is null)
    or (status <> 'open' and resolved_at is not null)
  )
);

create unique index community_reports_reporter_post_unique
  on public.community_reports (reporter_id, post_id)
  where post_id is not null;

create unique index community_reports_reporter_comment_unique
  on public.community_reports (reporter_id, comment_id)
  where comment_id is not null;

create index community_reports_open_post_idx
  on public.community_reports (post_id, created_at)
  where status = 'open' and post_id is not null;

create index community_reports_open_comment_idx
  on public.community_reports (comment_id, created_at)
  where status = 'open' and comment_id is not null;

create table public.community_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.community_sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 5 and 500),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid not null references public.community_admins(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint community_sanctions_period_check check (ends_at > starts_at)
);

create index community_sanctions_active_user_idx
  on public.community_sanctions (user_id, ends_at desc)
  where revoked_at is null;

create table public.community_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.community_admins(user_id) on delete restrict,
  action text not null check (action in ('hide', 'restore', 'delete', 'restrict')),
  target_type text not null check (target_type in ('post', 'comment', 'user')),
  post_id uuid references public.community_posts(id) on delete restrict,
  comment_id uuid references public.community_comments(id) on delete restrict,
  user_id uuid references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 5 and 500),
  created_at timestamptz not null default now(),
  constraint community_moderation_actions_one_target_check check (
    (target_type = 'post' and post_id is not null and comment_id is null and user_id is null)
    or (target_type = 'comment' and post_id is null and comment_id is not null and user_id is null)
    or (target_type = 'user' and post_id is null and comment_id is null and user_id is not null)
  )
);

create table public.community_rate_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  abuse_key text not null check (char_length(abuse_key) = 64),
  action text not null check (action in ('post', 'comment', 'report')),
  created_at timestamptz not null default now()
);

create index community_rate_events_actor_idx
  on public.community_rate_events (action, actor_id, created_at desc);

create index community_rate_events_abuse_idx
  on public.community_rate_events (action, abuse_key, created_at desc);

alter table public.community_profiles enable row level security;
alter table public.community_profiles force row level security;
alter table public.community_posts enable row level security;
alter table public.community_posts force row level security;
alter table public.community_comments enable row level security;
alter table public.community_comments force row level security;
alter table public.community_reports enable row level security;
alter table public.community_reports force row level security;
alter table public.community_admins enable row level security;
alter table public.community_admins force row level security;
alter table public.community_sanctions enable row level security;
alter table public.community_sanctions force row level security;
alter table public.community_moderation_actions enable row level security;
alter table public.community_moderation_actions force row level security;
alter table public.community_rate_events enable row level security;
alter table public.community_rate_events force row level security;

revoke all on public.community_profiles from anon, authenticated;
revoke all on public.community_posts from anon, authenticated;
grant select (id, author_name, title, body, link_url, status, created_at)
  on public.community_posts to anon, authenticated;
revoke insert, update, delete on public.community_posts from anon, authenticated;

revoke all on public.community_comments from anon, authenticated;
grant select (id, post_id, author_name, body, status, created_at)
  on public.community_comments to anon, authenticated;
revoke insert, update, delete on public.community_comments from anon, authenticated;

revoke all on public.community_reports from anon, authenticated;
revoke all on public.community_admins from anon, authenticated;
revoke all on public.community_sanctions from anon, authenticated;
revoke all on public.community_moderation_actions from anon, authenticated;
revoke all on public.community_rate_events from anon, authenticated;

create policy community_posts_visible_read
on public.community_posts for select
to anon, authenticated
using (status = 'visible');

create policy community_comments_visible_read
on public.community_comments for select
to anon, authenticated
using (
  status = 'visible'
  and exists (
    select 1
    from public.community_posts
    where community_posts.id = community_comments.post_id
      and community_posts.status = 'visible'
  )
);

create or replace function public.consume_community_rate_limit(
  p_actor_id uuid,
  p_abuse_key text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_lock bigint;
  abuse_lock bigint;
  actor_count integer;
  abuse_count integer;
begin
  if p_actor_id is null
    or p_abuse_key is null
    or char_length(p_abuse_key) <> 64
    or p_action not in ('post', 'comment', 'report')
    or p_limit < 1
    or p_window_seconds < 1
    or p_window_seconds > 86400
  then
    raise exception using errcode = '22023', message = 'invalid community rate limit input';
  end if;

  actor_lock := hashtextextended('community-rate:actor:' || p_action || ':' || p_actor_id::text, 0);
  abuse_lock := hashtextextended('community-rate:abuse:' || p_action || ':' || p_abuse_key, 0);

  perform pg_advisory_xact_lock(least(actor_lock, abuse_lock));
  if actor_lock <> abuse_lock then
    perform pg_advisory_xact_lock(greatest(actor_lock, abuse_lock));
  end if;

  delete from public.community_rate_events
  where created_at < now() - interval '24 hours';

  select count(*) into actor_count
  from public.community_rate_events
  where actor_id = p_actor_id
    and action = p_action
    and created_at >= now() - make_interval(secs => p_window_seconds);

  select count(*) into abuse_count
  from public.community_rate_events
  where abuse_key = p_abuse_key
    and action = p_action
    and created_at >= now() - make_interval(secs => p_window_seconds);

  if actor_count >= p_limit or abuse_count >= p_limit then
    return false;
  end if;

  insert into public.community_rate_events (actor_id, abuse_key, action)
  values (p_actor_id, p_abuse_key, p_action);

  return true;
end;
$$;

create or replace function public.submit_community_report(
  p_reporter_id uuid,
  p_reporter_abuse_key text,
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_detail text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_status public.community_content_status;
  inserted_report_id uuid;
  reporter_count integer;
  abuse_count integer;
  valid_report_count integer;
  temporarily_hidden boolean := false;
begin
  if p_reporter_id is null
    or p_reporter_abuse_key is null
    or char_length(p_reporter_abuse_key) <> 64
    or p_target_type not in ('post', 'comment')
    or p_target_id is null
    or p_reason not in (
      'privacy', 'illegal', 'copyright', 'harassment',
      'spam', 'financial_solicitation', 'other'
    )
    or p_detail is null
    or char_length(p_detail) > 500
  then
    raise exception using errcode = '22023', message = 'invalid community report input';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('community-report:' || p_target_type || ':' || p_target_id::text, 0)
  );

  if p_target_type = 'post' then
    select status into target_status
    from public.community_posts
    where id = p_target_id
    for update;
  else
    select status into target_status
    from public.community_comments
    where id = p_target_id
    for update;
  end if;

  if target_status is null or target_status = 'deleted' then
    raise exception using errcode = 'P0002', message = 'community report target not found';
  end if;

  if p_target_type = 'post' then
    insert into public.community_reports (
      reporter_id,
      reporter_abuse_key,
      post_id,
      reason,
      detail
    )
    values (
      p_reporter_id,
      p_reporter_abuse_key,
      p_target_id,
      p_reason::public.community_report_reason,
      p_detail
    )
    on conflict do nothing
    returning id into inserted_report_id;
  else
    insert into public.community_reports (
      reporter_id,
      reporter_abuse_key,
      comment_id,
      reason,
      detail
    )
    values (
      p_reporter_id,
      p_reporter_abuse_key,
      p_target_id,
      p_reason::public.community_report_reason,
      p_detail
    )
    on conflict do nothing
    returning id into inserted_report_id;
  end if;

  if inserted_report_id is null then
    raise exception using errcode = '23505', message = 'community report already submitted';
  end if;

  if p_target_type = 'post' then
    select count(distinct reporter_id), count(distinct reporter_abuse_key)
    into reporter_count, abuse_count
    from public.community_reports
    where post_id = p_target_id and status = 'open';
  else
    select count(distinct reporter_id), count(distinct reporter_abuse_key)
    into reporter_count, abuse_count
    from public.community_reports
    where comment_id = p_target_id and status = 'open';
  end if;

  valid_report_count := least(reporter_count, abuse_count);
  temporarily_hidden := p_reason in ('privacy', 'illegal') or valid_report_count >= 10;

  if temporarily_hidden then
    if p_target_type = 'post' then
      update public.community_posts
      set status = 'hidden'
      where id = p_target_id and status <> 'deleted';
    else
      update public.community_comments
      set status = 'hidden'
      where id = p_target_id and status <> 'deleted';
    end if;
  end if;

  return jsonb_build_object(
    'accepted', true,
    'temporarilyHidden', temporarily_hidden
  );
end;
$$;

revoke all on function public.consume_community_rate_limit(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_community_rate_limit(uuid, text, text, integer, integer) to service_role;

revoke all on function public.submit_community_report(uuid, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_community_report(uuid, text, text, uuid, text, text) to service_role;
