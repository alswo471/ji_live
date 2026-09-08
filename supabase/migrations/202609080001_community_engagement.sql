alter table public.community_posts
  add column view_count bigint not null default 0,
  add column recommendation_count bigint not null default 0,
  add constraint community_posts_view_count_nonnegative check (view_count >= 0),
  add constraint community_posts_recommendation_count_nonnegative check (recommendation_count >= 0);

grant select (view_count, recommendation_count)
  on public.community_posts to anon, authenticated;

create table public.community_post_view_receipts (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  last_counted_at timestamptz not null default clock_timestamp(),
  primary key (post_id, actor_id)
);

create index community_post_view_receipts_expiry_idx
  on public.community_post_view_receipts (last_counted_at);

create table public.community_post_recommendations (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (post_id, actor_id)
);

alter table public.community_post_view_receipts enable row level security;
alter table public.community_post_view_receipts force row level security;
alter table public.community_post_recommendations enable row level security;
alter table public.community_post_recommendations force row level security;

revoke all on public.community_post_view_receipts from public, anon, authenticated;
revoke all on public.community_post_recommendations from public, anon, authenticated;
grant select on public.community_post_view_receipts to service_role;
grant select on public.community_post_recommendations to service_role;

create function public.sync_community_post_recommendation_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
    set recommendation_count = recommendation_count + 1
    where id = new.post_id;
    return new;
  end if;

  update public.community_posts
  set recommendation_count = recommendation_count - 1
  where id = old.post_id;
  return old;
end;
$$;

create trigger community_post_recommendation_count_sync
after insert or delete on public.community_post_recommendations
for each row execute function public.sync_community_post_recommendation_count();

create function public.record_community_post_view(
  p_post_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  action_time timestamptz := clock_timestamp();
  post_status public.community_content_status;
  counted integer;
  result jsonb;
begin
  if p_post_id is null or p_actor_id is null then
    raise exception using errcode = '22023', message = 'invalid community view input';
  end if;

  select status into post_status
  from public.community_posts
  where id = p_post_id
  for update;

  if post_status is null or post_status <> 'visible' then
    raise exception using errcode = 'P0002', message = 'community post not found';
  end if;

  if exists (
    select 1 from public.community_sanctions
    where user_id = p_actor_id and revoked_at is null and ends_at > action_time
  ) then
    raise exception using errcode = '42501', message = 'community actor restricted';
  end if;

  insert into public.community_post_view_receipts (post_id, actor_id, last_counted_at)
  values (p_post_id, p_actor_id, action_time)
  on conflict (post_id, actor_id) do update
    set last_counted_at = excluded.last_counted_at
    where community_post_view_receipts.last_counted_at <= action_time - interval '24 hours'
  returning 1 into counted;

  if counted = 1 then
    update public.community_posts
    set view_count = view_count + 1
    where id = p_post_id;
  end if;

  select jsonb_build_object(
    'viewCount', p.view_count,
    'recommendationCount', p.recommendation_count,
    'recommended', exists (
      select 1 from public.community_post_recommendations r
      where r.post_id = p.id and r.actor_id = p_actor_id
    ),
    'canRecommend', p.author_id <> p_actor_id
  ) into result
  from public.community_posts p
  where p.id = p_post_id;

  return result;
end;
$$;

create function public.set_community_post_recommendation(
  p_post_id uuid,
  p_actor_id uuid,
  p_recommended boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  action_time timestamptz := clock_timestamp();
  post_author_id uuid;
  post_status public.community_content_status;
  result jsonb;
begin
  if p_post_id is null or p_actor_id is null or p_recommended is null then
    raise exception using errcode = '22023', message = 'invalid community recommendation input';
  end if;

  select author_id, status into post_author_id, post_status
  from public.community_posts
  where id = p_post_id
  for update;

  if post_status is null or post_status <> 'visible' then
    raise exception using errcode = 'P0002', message = 'community post not found';
  end if;
  if post_author_id = p_actor_id then
    raise exception using errcode = '42501', message = 'self recommendation forbidden';
  end if;
  if exists (
    select 1 from public.community_sanctions
    where user_id = p_actor_id and revoked_at is null and ends_at > action_time
  ) then
    raise exception using errcode = '42501', message = 'community actor restricted';
  end if;

  if p_recommended then
    insert into public.community_post_recommendations (post_id, actor_id, created_at)
    values (p_post_id, p_actor_id, action_time)
    on conflict (post_id, actor_id) do nothing;
  else
    delete from public.community_post_recommendations
    where post_id = p_post_id and actor_id = p_actor_id;
  end if;

  select jsonb_build_object(
    'viewCount', p.view_count,
    'recommendationCount', p.recommendation_count,
    'recommended', exists (
      select 1 from public.community_post_recommendations r
      where r.post_id = p.id and r.actor_id = p_actor_id
    ),
    'canRecommend', true
  ) into result
  from public.community_posts p
  where p.id = p_post_id;

  return result;
end;
$$;

alter table public.community_rate_events
  drop constraint community_rate_events_action_check,
  add constraint community_rate_events_action_check
    check (action in ('post', 'comment', 'report', 'delete', 'view', 'recommend'));

create or replace function public.consume_community_rate_limit(
  p_actor_id uuid,
  p_abuse_key text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  action_time timestamptz := clock_timestamp();
  actor_lock bigint;
  abuse_lock bigint;
  actor_count integer;
  abuse_count integer;
  actor_retry_at timestamptz;
  abuse_retry_at timestamptz;
  retry_at timestamptz;
  retry_after_seconds integer;
begin
  if p_actor_id is null
    or p_abuse_key is null
    or char_length(p_abuse_key) <> 64
    or p_action not in ('post', 'comment', 'report', 'delete', 'view', 'recommend')
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
  where created_at <= action_time - interval '24 hours';

  select count(*) into actor_count from public.community_rate_events
  where actor_id = p_actor_id and action = p_action
    and created_at > action_time - make_interval(secs => p_window_seconds);
  select count(*) into abuse_count from public.community_rate_events
  where abuse_key = p_abuse_key and action = p_action
    and created_at > action_time - make_interval(secs => p_window_seconds);

  if actor_count >= p_limit then
    select created_at + make_interval(secs => p_window_seconds) into actor_retry_at
    from public.community_rate_events
    where actor_id = p_actor_id and action = p_action
      and created_at > action_time - make_interval(secs => p_window_seconds)
    order by created_at, id offset greatest(actor_count - p_limit, 0) limit 1;
  end if;
  if abuse_count >= p_limit then
    select created_at + make_interval(secs => p_window_seconds) into abuse_retry_at
    from public.community_rate_events
    where abuse_key = p_abuse_key and action = p_action
      and created_at > action_time - make_interval(secs => p_window_seconds)
    order by created_at, id offset greatest(abuse_count - p_limit, 0) limit 1;
  end if;

  if actor_retry_at is not null or abuse_retry_at is not null then
    retry_at := case
      when actor_retry_at is null then abuse_retry_at
      when abuse_retry_at is null then actor_retry_at
      else greatest(actor_retry_at, abuse_retry_at)
    end;
    retry_after_seconds := greatest(1, ceil(extract(epoch from (retry_at - action_time)))::integer);
    return jsonb_build_object(
      'allowed', false,
      'retryAfterSeconds', retry_after_seconds,
      'retryAt', retry_at
    );
  end if;

  insert into public.community_rate_events (actor_id, abuse_key, action, created_at)
  values (p_actor_id, p_abuse_key, p_action, action_time);
  return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0, 'retryAt', null);
end;
$$;

create function public.cleanup_community_post_view_receipts(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  deleted_count integer;
begin
  delete from public.community_post_view_receipts
  where last_counted_at <= p_now - interval '24 hours';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

select cron.schedule(
  'community-view-receipts-hourly',
  '17 * * * *',
  $job$select public.cleanup_community_post_view_receipts(now())$job$
);

revoke all on function public.sync_community_post_recommendation_count() from public, anon, authenticated;
revoke all on function public.record_community_post_view(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_community_post_recommendation(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.cleanup_community_post_view_receipts(timestamptz) from public, anon, authenticated;
revoke all on function public.consume_community_rate_limit(uuid, text, text, integer, integer) from public, anon, authenticated;

grant execute on function public.record_community_post_view(uuid, uuid) to service_role;
grant execute on function public.set_community_post_recommendation(uuid, uuid, boolean) to service_role;
grant execute on function public.cleanup_community_post_view_receipts(timestamptz) to service_role;
grant execute on function public.consume_community_rate_limit(uuid, text, text, integer, integer) to service_role;
