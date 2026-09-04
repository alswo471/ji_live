alter table public.community_reports
  alter column reporter_abuse_key drop not null,
  add column reporter_abuse_key_expires_at timestamptz;

update public.community_reports
set reporter_abuse_key_expires_at = created_at + interval '24 hours';

update public.community_reports
set reporter_abuse_key = null
where reporter_abuse_key_expires_at <= now();

alter table public.community_reports
  alter column reporter_abuse_key_expires_at set not null,
  add constraint community_reports_abuse_key_lifecycle_check check (
    reporter_abuse_key_expires_at >= created_at
    and reporter_abuse_key_expires_at <= created_at + interval '24 hours'
  );

create function public.set_community_report_abuse_key_expiry()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.reporter_abuse_key_expires_at := new.created_at + interval '24 hours';
  return new;
end;
$$;

create trigger community_reports_set_abuse_key_expiry
before insert on public.community_reports
for each row execute function public.set_community_report_abuse_key_expiry();

alter table public.community_posts
  add column hidden_source text,
  add column hidden_reason text,
  add column hidden_at timestamptz;

alter table public.community_comments
  add column hidden_source text,
  add column hidden_reason text,
  add column hidden_at timestamptz;

with hidden_backfill as (
  select
    p.id,
    a.reason as admin_reason,
    a.created_at as admin_hidden_at,
    (
      select max(r.created_at)
      from public.community_reports r
      where r.post_id = p.id
    ) as report_hidden_at
  from public.community_posts p
  left join lateral (
    select reason, created_at
    from public.community_moderation_actions a
    where a.post_id = p.id and a.action = 'hide'
    order by a.created_at desc, a.id desc
    limit 1
  ) a on true
  where p.status = 'hidden'
)
update public.community_posts p
set
  hidden_source = case
    when b.admin_hidden_at is null then 'automatic'
    else 'admin'
  end,
  hidden_reason = coalesce(b.admin_reason, '이전 자동 숨김 기록'),
  hidden_at = coalesce(b.admin_hidden_at, b.report_hidden_at, p.created_at)
from hidden_backfill b
where p.id = b.id;

with hidden_backfill as (
  select
    c.id,
    a.reason as admin_reason,
    a.created_at as admin_hidden_at,
    (
      select max(r.created_at)
      from public.community_reports r
      where r.comment_id = c.id
    ) as report_hidden_at
  from public.community_comments c
  left join lateral (
    select reason, created_at
    from public.community_moderation_actions a
    where a.comment_id = c.id and a.action = 'hide'
    order by a.created_at desc, a.id desc
    limit 1
  ) a on true
  where c.status = 'hidden'
)
update public.community_comments c
set
  hidden_source = case
    when b.admin_hidden_at is null then 'automatic'
    else 'admin'
  end,
  hidden_reason = coalesce(b.admin_reason, '이전 자동 숨김 기록'),
  hidden_at = coalesce(b.admin_hidden_at, b.report_hidden_at, c.created_at)
from hidden_backfill b
where c.id = b.id;

alter table public.community_posts
  add constraint community_posts_hidden_metadata_check check (
    (status = 'hidden'
      and hidden_source in ('automatic', 'admin')
      and hidden_reason is not null
      and char_length(hidden_reason) between 1 and 500
      and hidden_at is not null)
    or (status <> 'hidden'
      and hidden_source is null
      and hidden_reason is null
      and hidden_at is null)
  );

alter table public.community_comments
  add constraint community_comments_hidden_metadata_check check (
    (status = 'hidden'
      and hidden_source in ('automatic', 'admin')
      and hidden_reason is not null
      and char_length(hidden_reason) between 1 and 500
      and hidden_at is not null)
    or (status <> 'hidden'
      and hidden_source is null
      and hidden_reason is null
      and hidden_at is null)
  );

alter table public.community_moderation_actions
  drop constraint community_moderation_actions_action_check,
  add constraint community_moderation_actions_action_check
    check (action in ('hide', 'restore', 'delete', 'dismiss', 'restrict', 'unrestrict')),
  add column target_title_snapshot text,
  add column target_body_snapshot text,
  add column deletion_source text check (deletion_source in ('author', 'admin'));

update public.community_moderation_actions a
set
  target_title_snapshot = p.title,
  target_body_snapshot = p.body,
  deletion_source = case when a.action = 'delete' then 'admin' else null end
from public.community_posts p
where a.post_id = p.id;

update public.community_moderation_actions a
set
  target_body_snapshot = c.body,
  deletion_source = case when a.action = 'delete' then 'admin' else null end
from public.community_comments c
where a.comment_id = c.id;

drop view public.community_admin_content;

create view public.community_admin_content as
select
  'post'::text as target_type,
  p.id as target_id,
  p.author_id,
  p.author_name,
  p.title,
  p.body,
  p.status,
  p.deletion_source,
  p.deleted_at,
  p.purge_at,
  p.hidden_source,
  p.hidden_reason,
  p.hidden_at,
  p.created_at
from public.community_posts p
union all
select
  'comment'::text as target_type,
  c.id as target_id,
  c.author_id,
  c.author_name,
  null::text as title,
  c.body,
  c.status,
  c.deletion_source,
  c.deleted_at,
  c.purge_at,
  c.hidden_source,
  c.hidden_reason,
  c.hidden_at,
  c.created_at
from public.community_comments c;

revoke all on public.community_admin_content from public, anon, authenticated;
grant select on public.community_admin_content to service_role;

alter table public.community_rate_events
  drop constraint community_rate_events_action_check,
  add constraint community_rate_events_action_check
    check (action in ('post', 'comment', 'report', 'delete'));

drop function public.consume_community_rate_limit(uuid, text, text, integer, integer);

create function public.consume_community_rate_limit(
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
    or p_action not in ('post', 'comment', 'report', 'delete')
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

  select count(*) into actor_count
  from public.community_rate_events
  where actor_id = p_actor_id
    and action = p_action
    and created_at > action_time - make_interval(secs => p_window_seconds);

  select count(*) into abuse_count
  from public.community_rate_events
  where abuse_key = p_abuse_key
    and action = p_action
    and created_at > action_time - make_interval(secs => p_window_seconds);

  if actor_count >= p_limit then
    select created_at + make_interval(secs => p_window_seconds)
    into actor_retry_at
    from public.community_rate_events
    where actor_id = p_actor_id
      and action = p_action
      and created_at > action_time - make_interval(secs => p_window_seconds)
    order by created_at asc, id asc
    offset greatest(actor_count - p_limit, 0)
    limit 1;
  end if;

  if abuse_count >= p_limit then
    select created_at + make_interval(secs => p_window_seconds)
    into abuse_retry_at
    from public.community_rate_events
    where abuse_key = p_abuse_key
      and action = p_action
      and created_at > action_time - make_interval(secs => p_window_seconds)
    order by created_at asc, id asc
    offset greatest(abuse_count - p_limit, 0)
    limit 1;
  end if;

  if actor_retry_at is not null or abuse_retry_at is not null then
    retry_at := case
      when actor_retry_at is null then abuse_retry_at
      when abuse_retry_at is null then actor_retry_at
      else greatest(actor_retry_at, abuse_retry_at)
    end;
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (retry_at - action_time)))::integer
    );
    return jsonb_build_object(
      'allowed', false,
      'retryAfterSeconds', retry_after_seconds,
      'retryAt', retry_at
    );
  end if;

  insert into public.community_rate_events (actor_id, abuse_key, action, created_at)
  values (p_actor_id, p_abuse_key, p_action, action_time);

  return jsonb_build_object(
    'allowed', true,
    'retryAfterSeconds', 0,
    'retryAt', null
  );
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
  action_time timestamptz := clock_timestamp();
  target_status public.community_content_status;
  inserted_report_id uuid;
  reporter_count integer;
  abuse_count integer;
  valid_report_count integer;
  temporarily_hidden boolean := false;
  automatic_reason text;
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

  update public.community_reports
  set reporter_abuse_key = null
  where reporter_abuse_key is not null
    and reporter_abuse_key_expires_at <= action_time;

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
      reporter_id, reporter_abuse_key, reporter_abuse_key_expires_at,
      post_id, reason, detail, created_at
    ) values (
      p_reporter_id, p_reporter_abuse_key, action_time + interval '24 hours',
      p_target_id, p_reason::public.community_report_reason, p_detail, action_time
    )
    on conflict do nothing
    returning id into inserted_report_id;
  else
    insert into public.community_reports (
      reporter_id, reporter_abuse_key, reporter_abuse_key_expires_at,
      comment_id, reason, detail, created_at
    ) values (
      p_reporter_id, p_reporter_abuse_key, action_time + interval '24 hours',
      p_target_id, p_reason::public.community_report_reason, p_detail, action_time
    )
    on conflict do nothing
    returning id into inserted_report_id;
  end if;

  if inserted_report_id is null then
    raise exception using errcode = '23505', message = 'community report already submitted';
  end if;

  if p_target_type = 'post' then
    select
      count(distinct reporter_id),
      count(distinct reporter_abuse_key) filter (
        where reporter_abuse_key is not null
          and reporter_abuse_key_expires_at > action_time
      )
    into reporter_count, abuse_count
    from public.community_reports
    where post_id = p_target_id and status = 'open';
  else
    select
      count(distinct reporter_id),
      count(distinct reporter_abuse_key) filter (
        where reporter_abuse_key is not null
          and reporter_abuse_key_expires_at > action_time
      )
    into reporter_count, abuse_count
    from public.community_reports
    where comment_id = p_target_id and status = 'open';
  end if;

  valid_report_count := least(reporter_count, abuse_count);
  temporarily_hidden := p_reason in ('privacy', 'illegal') or valid_report_count >= 10;
  automatic_reason := case
    when p_reason = 'privacy' then '개인정보 신고로 자동 숨김'
    when p_reason = 'illegal' then '불법 콘텐츠 신고로 자동 숨김'
    else '서로 다른 네트워크 신고 10건으로 자동 숨김'
  end;

  if temporarily_hidden and target_status = 'visible' then
    if p_target_type = 'post' then
      update public.community_posts
      set status = 'hidden', hidden_source = 'automatic',
          hidden_reason = automatic_reason, hidden_at = action_time
      where id = p_target_id and status = 'visible';
    else
      update public.community_comments
      set status = 'hidden', hidden_source = 'automatic',
          hidden_reason = automatic_reason, hidden_at = action_time
      where id = p_target_id and status = 'visible';
    end if;
  end if;

  return jsonb_build_object(
    'accepted', true,
    'temporarilyHidden', temporarily_hidden
  );
end;
$$;

create or replace function public.delete_community_content_by_author(
  p_actor_id uuid,
  p_target_type text,
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  deleted_time timestamptz := clock_timestamp();
begin
  if p_target_type = 'post' then
    update public.community_posts
    set status = 'deleted', deletion_source = 'author',
        deleted_at = deleted_time, purge_at = deleted_time + interval '1 year',
        hidden_source = null, hidden_reason = null, hidden_at = null
    where id = p_target_id and author_id = p_actor_id and status <> 'deleted';
  elsif p_target_type = 'comment' then
    update public.community_comments
    set status = 'deleted', deletion_source = 'author',
        deleted_at = deleted_time, purge_at = deleted_time + interval '1 year',
        hidden_source = null, hidden_reason = null, hidden_at = null
    where id = p_target_id and author_id = p_actor_id and status <> 'deleted';
  else
    raise exception using errcode = '22023', message = 'invalid community target';
  end if;

  if not found then
    raise exception using errcode = 'P0002', message = 'community content not found';
  end if;

  if p_target_type = 'post' then
    update public.community_reports
    set status = 'dismissed', resolved_at = deleted_time
    where post_id = p_target_id and status = 'open';
  else
    update public.community_reports
    set status = 'dismissed', resolved_at = deleted_time
    where comment_id = p_target_id and status = 'open';
  end if;
end;
$$;

create function public.moderate_community_content(
  p_admin_id uuid,
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_user_id uuid,
  p_until timestamptz,
  p_reason text,
  p_report_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_reason text := btrim(p_reason);
  target_status public.community_content_status;
  target_author_id uuid;
  target_title text;
  target_body text;
  target_deletion_source text;
  action_time timestamptz := clock_timestamp();
begin
  if p_admin_id is null
    or not exists (
      select 1 from public.community_admins where user_id = p_admin_id
    )
  then
    raise exception using errcode = '42501', message = 'community admin access denied';
  end if;

  if normalized_reason is null or char_length(normalized_reason) not between 5 and 500 then
    raise exception using errcode = '22023', message = 'invalid moderation reason';
  end if;

  if p_action in ('hide', 'restore', 'delete', 'dismiss') then
    if p_target_type not in ('post', 'comment')
      or p_target_id is null
      or p_user_id is not null
      or p_until is not null
      or (p_action = 'dismiss' and p_report_id is null)
    then
      raise exception using errcode = '22023', message = 'invalid moderation target';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('community-moderation:' || p_target_type || ':' || p_target_id::text, 0)
    );

    if p_target_type = 'post' then
      select status, author_id, title, body, deletion_source
      into target_status, target_author_id, target_title, target_body, target_deletion_source
      from public.community_posts
      where id = p_target_id
      for update;
    else
      select status, author_id, null::text, body, deletion_source
      into target_status, target_author_id, target_title, target_body, target_deletion_source
      from public.community_comments
      where id = p_target_id
      for update;
    end if;

    if target_status is null then
      raise exception using errcode = 'P0002', message = 'community moderation target not found';
    end if;

    if (p_action in ('hide', 'dismiss') and target_status <> 'visible')
      or (p_action = 'delete' and target_status = 'deleted')
      or (p_action = 'restore' and target_status not in ('hidden', 'deleted'))
    then
      raise exception using errcode = 'P0001', message = 'community moderation state conflict';
    end if;

    if p_report_id is not null then
      perform 1
      from public.community_reports r
      where r.id = p_report_id
        and r.status = 'open'
        and (
          (p_target_type = 'post' and r.post_id = p_target_id)
          or (p_target_type = 'comment' and r.comment_id = p_target_id)
        )
      for update;
      if not found then
        raise exception using errcode = 'P0001', message = 'community moderation state conflict';
      end if;
    end if;

    if p_action = 'dismiss' then
      update public.community_reports
      set status = 'dismissed', resolved_at = action_time
      where id = p_report_id and status = 'open';

      insert into public.community_moderation_actions (
        admin_id, action, target_type, post_id, comment_id, reason, created_at,
        target_title_snapshot, target_body_snapshot, deletion_source
      ) values (
        p_admin_id, 'dismiss', p_target_type,
        case when p_target_type = 'post' then p_target_id else null end,
        case when p_target_type = 'comment' then p_target_id else null end,
        normalized_reason, action_time, target_title, target_body, null
      );
      return;
    end if;

    if p_target_type = 'post' then
      update public.community_posts
      set
        status = case
          when p_action = 'hide' then 'hidden'::public.community_content_status
          when p_action = 'restore' then 'visible'::public.community_content_status
          else 'deleted'::public.community_content_status
        end,
        deletion_source = case when p_action = 'delete' then 'admin' else null end,
        deleted_at = case when p_action = 'delete' then action_time else null end,
        purge_at = case when p_action = 'delete' then action_time + interval '1 year' else null end,
        hidden_source = case when p_action = 'hide' then 'admin' else null end,
        hidden_reason = case when p_action = 'hide' then normalized_reason else null end,
        hidden_at = case when p_action = 'hide' then action_time else null end
      where id = p_target_id;

      update public.community_reports
      set status = 'resolved', resolved_at = action_time
      where post_id = p_target_id and status = 'open';
    else
      update public.community_comments
      set
        status = case
          when p_action = 'hide' then 'hidden'::public.community_content_status
          when p_action = 'restore' then 'visible'::public.community_content_status
          else 'deleted'::public.community_content_status
        end,
        deletion_source = case when p_action = 'delete' then 'admin' else null end,
        deleted_at = case when p_action = 'delete' then action_time else null end,
        purge_at = case when p_action = 'delete' then action_time + interval '1 year' else null end,
        hidden_source = case when p_action = 'hide' then 'admin' else null end,
        hidden_reason = case when p_action = 'hide' then normalized_reason else null end,
        hidden_at = case when p_action = 'hide' then action_time else null end
      where id = p_target_id;

      update public.community_reports
      set status = 'resolved', resolved_at = action_time
      where comment_id = p_target_id and status = 'open';
    end if;

    insert into public.community_moderation_actions (
      admin_id, action, target_type, post_id, comment_id, reason, created_at,
      target_title_snapshot, target_body_snapshot, deletion_source
    ) values (
      p_admin_id, p_action, p_target_type,
      case when p_target_type = 'post' then p_target_id else null end,
      case when p_target_type = 'comment' then p_target_id else null end,
      normalized_reason, action_time, target_title, target_body,
      case
        when p_action = 'delete' then 'admin'
        when p_action = 'restore' then target_deletion_source
        else null
      end
    );
  elsif p_action = 'restrict' then
    if p_until is null or p_until <= action_time then
      raise exception using errcode = '22023', message = 'invalid community restriction';
    end if;

    if p_report_id is not null then
      if p_target_type not in ('post', 'comment')
        or p_target_id is null
        or p_user_id is not null
      then
        raise exception using errcode = '22023', message = 'invalid community restriction';
      end if;

      perform pg_advisory_xact_lock(
        hashtextextended('community-moderation:' || p_target_type || ':' || p_target_id::text, 0)
      );

      if p_target_type = 'post' then
        select status, author_id, title, body
        into target_status, target_author_id, target_title, target_body
        from public.community_posts
        where id = p_target_id
        for update;
      else
        select status, author_id, null::text, body
        into target_status, target_author_id, target_title, target_body
        from public.community_comments
        where id = p_target_id
        for update;
      end if;

      if target_status is null then
        raise exception using errcode = 'P0002', message = 'community moderation target not found';
      elsif target_status = 'deleted' then
        raise exception using errcode = 'P0001', message = 'community moderation state conflict';
      end if;

      perform 1
      from public.community_reports r
      where r.id = p_report_id
        and r.status = 'open'
        and (
          (p_target_type = 'post' and r.post_id = p_target_id)
          or (p_target_type = 'comment' and r.comment_id = p_target_id)
        )
      for update;
      if not found then
        raise exception using errcode = 'P0001', message = 'community moderation state conflict';
      end if;
    else
      if p_target_type <> 'user' or p_target_id is not null or p_user_id is null then
        raise exception using errcode = '22023', message = 'invalid community restriction';
      end if;
      target_author_id := p_user_id;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('community-moderation:user:' || target_author_id::text, 0)
    );

    if exists (
      select 1
      from public.community_sanctions s
      where s.user_id = target_author_id
        and s.revoked_at is null
        and s.ends_at > action_time
    ) then
      raise exception using errcode = 'P0001', message = 'community moderation state conflict';
    end if;

    insert into public.community_sanctions (
      user_id, reason, ends_at, created_by, starts_at
    ) values (
      target_author_id, normalized_reason, p_until, p_admin_id, action_time
    );

    if p_report_id is not null then
      update public.community_reports
      set status = 'resolved', resolved_at = action_time
      where id = p_report_id and status = 'open';
    end if;

    insert into public.community_moderation_actions (
      admin_id, action, target_type, user_id, reason, created_at,
      target_title_snapshot, target_body_snapshot
    ) values (
      p_admin_id, 'restrict', 'user', target_author_id, normalized_reason, action_time,
      target_title, target_body
    );
  else
    raise exception using errcode = '22023', message = 'invalid moderation action';
  end if;
end;
$$;

create or replace function public.moderate_community_content(
  p_admin_id uuid,
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_user_id uuid,
  p_until timestamptz,
  p_reason text
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.moderate_community_content(
    p_admin_id, p_action, p_target_type, p_target_id,
    p_user_id, p_until, p_reason, null
  );
$$;

create or replace function public.revoke_community_sanction(
  p_admin_id uuid,
  p_sanction_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_reason text := btrim(p_reason);
  sanction_user_id uuid;
  sanction_revoked_at timestamptz;
  sanction_ends_at timestamptz;
  action_time timestamptz := clock_timestamp();
begin
  if p_admin_id is null
    or not exists (
      select 1 from public.community_admins where user_id = p_admin_id
    )
  then
    raise exception using errcode = '42501', message = 'community admin access denied';
  end if;

  if normalized_reason is null or char_length(normalized_reason) not between 5 and 500 then
    raise exception using errcode = '22023', message = 'invalid moderation reason';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('community-sanction:' || p_sanction_id::text, 0)
  );

  select user_id, revoked_at, ends_at
  into sanction_user_id, sanction_revoked_at, sanction_ends_at
  from public.community_sanctions
  where id = p_sanction_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'community sanction not found';
  elsif sanction_revoked_at is not null or sanction_ends_at <= action_time then
    raise exception using errcode = 'P0001', message = 'community moderation state conflict';
  end if;

  update public.community_sanctions
  set revoked_at = action_time
  where id = p_sanction_id;

  insert into public.community_moderation_actions (
    admin_id, action, target_type, user_id, reason, created_at
  ) values (
    p_admin_id, 'unrestrict', 'user', sanction_user_id, normalized_reason, action_time
  );
end;
$$;

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
  report_abuse_key_count integer := 0;
  post_count integer := 0;
  comment_count integer := 0;
  report_count integer := 0;
  moderation_count integer := 0;
  sanction_count integer := 0;
  user_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('community-retention', 0));

  delete from public.community_rate_events
  where created_at <= p_now - interval '24 hours';
  get diagnostics rate_count = row_count;

  update public.community_reports
  set reporter_abuse_key = null
  where reporter_abuse_key is not null
    and reporter_abuse_key_expires_at <= p_now;
  get diagnostics report_abuse_key_count = row_count;

  delete from public.community_reports r
  where r.status <> 'open'
    and r.resolved_at <= p_now - interval '1 year'
    and not exists (
      select 1 from public.community_legal_holds h
      where h.subject_type = 'report' and h.subject_id = r.id
        and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    );
  get diagnostics report_count = row_count;

  delete from public.community_moderation_actions a
  where a.created_at <= p_now - interval '1 year'
    and not exists (
      select 1 from public.community_legal_holds h
      where h.subject_type = 'moderation_action' and h.subject_id = a.id
        and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    );
  get diagnostics moderation_count = row_count;

  delete from public.community_sanctions s
  where coalesce(s.revoked_at, s.ends_at) <= p_now - interval '1 year'
    and not exists (
      select 1 from public.community_legal_holds h
      where h.subject_type = 'user' and h.subject_id = s.user_id
        and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    );
  get diagnostics sanction_count = row_count;

  with dependent_comments as (
    select c.*
    from public.community_comments c
  )
  select coalesce(array_agg(p.id), '{}'::uuid[])
  into eligible_posts
  from public.community_posts p
  where p.status = 'deleted'
    and p.purge_at <= p_now
    and not exists (
      select 1 from public.community_legal_holds h
      where h.subject_type = 'post' and h.subject_id = p.id
        and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    )
    and not exists (
      select 1
      from dependent_comments c
      join public.community_legal_holds h
        on h.subject_type = 'comment' and h.subject_id = c.id
      where c.post_id = p.id
        and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    )
    and not exists (
      select 1 from dependent_comments c
      where c.post_id = p.id
        and c.status = 'deleted'
        and c.purge_at > p_now
    )
    and not exists (
      select 1 from public.community_reports r
      where r.post_id = p.id
        or r.comment_id in (
          select c.id from dependent_comments c where c.post_id = p.id
        )
    )
    and not exists (
      select 1 from public.community_moderation_actions a
      where a.post_id = p.id
        or a.comment_id in (
          select c.id from dependent_comments c where c.post_id = p.id
        )
    );

  select coalesce(array_agg(c.id), '{}'::uuid[])
  into eligible_comments
  from public.community_comments c
  where (
      c.post_id = any(eligible_posts)
      or (c.status = 'deleted' and c.purge_at <= p_now)
    )
    and not exists (
      select 1 from public.community_legal_holds h
      where h.subject_type = 'comment' and h.subject_id = c.id
        and h.released_at is null and (h.ends_at is null or h.ends_at > p_now)
    )
    and not exists (
      select 1 from public.community_reports r where r.comment_id = c.id
    )
    and not exists (
      select 1 from public.community_moderation_actions a where a.comment_id = c.id
    );

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
    'reportAbuseKeys', report_abuse_key_count,
    'posts', post_count,
    'comments', comment_count,
    'reports', report_count,
    'moderationActions', moderation_count,
    'sanctions', sanction_count,
    'anonymousUsers', user_count
  );
end;
$$;

revoke all on function public.consume_community_rate_limit(uuid, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_community_rate_limit(uuid, text, text, integer, integer)
  to service_role;

revoke all on function public.submit_community_report(uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_community_report(uuid, text, text, uuid, text, text)
  to service_role;

revoke all on function public.delete_community_content_by_author(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_community_content_by_author(uuid, text, uuid)
  to service_role;

revoke all on function public.moderate_community_content(uuid, text, text, uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.moderate_community_content(uuid, text, text, uuid, uuid, timestamptz, text)
  to service_role;

revoke all on function public.moderate_community_content(uuid, text, text, uuid, uuid, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.moderate_community_content(uuid, text, text, uuid, uuid, timestamptz, text, uuid)
  to service_role;

revoke all on function public.revoke_community_sanction(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_community_sanction(uuid, uuid, text)
  to service_role;

revoke all on function public.run_community_retention(timestamptz)
  from public, anon, authenticated;
grant execute on function public.run_community_retention(timestamptz)
  to service_role;
