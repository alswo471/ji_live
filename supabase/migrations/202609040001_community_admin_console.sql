alter table public.community_posts
  add column deletion_source text,
  add column purge_at timestamptz;

alter table public.community_comments
  add column deletion_source text,
  add column purge_at timestamptz;

update public.community_posts p
set deletion_source = case when exists (
      select 1 from public.community_moderation_actions a
      where a.post_id = p.id and a.action = 'delete'
    ) then 'admin' else 'author' end,
    purge_at = p.deleted_at + interval '1 year'
where p.status = 'deleted';

update public.community_comments c
set deletion_source = case when exists (
      select 1 from public.community_moderation_actions a
      where a.comment_id = c.id and a.action = 'delete'
    ) then 'admin' else 'author' end,
    purge_at = c.deleted_at + interval '1 year'
where c.status = 'deleted';

alter table public.community_posts
  add constraint community_posts_deletion_metadata_check check (
    (status = 'deleted'
      and deletion_source is not null
      and deletion_source in ('author', 'admin')
      and deleted_at is not null
      and purge_at is not null)
    or (status <> 'deleted'
      and deletion_source is null
      and deleted_at is null
      and purge_at is null)
  );

alter table public.community_comments
  add constraint community_comments_deletion_metadata_check check (
    (status = 'deleted'
      and deletion_source is not null
      and deletion_source in ('author', 'admin')
      and deleted_at is not null
      and purge_at is not null)
    or (status <> 'deleted'
      and deletion_source is null
      and deleted_at is null
      and purge_at is null)
  );

alter table public.community_moderation_actions
  drop constraint community_moderation_actions_action_check,
  add constraint community_moderation_actions_action_check
  check (action in ('hide', 'restore', 'delete', 'restrict', 'unrestrict'));

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
  deleted_time timestamptz := now();
begin
  if p_target_type = 'post' then
    update public.community_posts
    set status = 'deleted', deletion_source = 'author',
        deleted_at = deleted_time, purge_at = deleted_time + interval '1 year'
    where id = p_target_id and author_id = p_actor_id and status <> 'deleted';
  elsif p_target_type = 'comment' then
    update public.community_comments
    set status = 'deleted', deletion_source = 'author',
        deleted_at = deleted_time, purge_at = deleted_time + interval '1 year'
    where id = p_target_id and author_id = p_actor_id and status <> 'deleted';
  else
    raise exception using errcode = '22023', message = 'invalid community target';
  end if;

  if not found then
    raise exception using errcode = 'P0002', message = 'community content not found';
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
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_reason text := btrim(p_reason);
  target_status public.community_content_status;
  action_time timestamptz := now();
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

  if p_action in ('hide', 'restore', 'delete') then
    if p_target_type not in ('post', 'comment')
      or p_target_id is null
      or p_user_id is not null
      or p_until is not null
    then
      raise exception using errcode = '22023', message = 'invalid moderation target';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('community-moderation:' || p_target_type || ':' || p_target_id::text, 0)
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

    if target_status is null then
      raise exception using errcode = 'P0002', message = 'community moderation target not found';
    elsif (p_action in ('hide', 'delete') and target_status = 'deleted')
      or (p_action = 'restore' and target_status not in ('hidden', 'deleted'))
    then
      raise exception using errcode = 'P0001', message = 'community moderation state conflict';
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
        purge_at = case when p_action = 'delete' then action_time + interval '1 year' else null end
      where id = p_target_id;

      update public.community_reports
      set status = 'resolved', resolved_at = action_time
      where post_id = p_target_id and status = 'open';

      insert into public.community_moderation_actions (
        admin_id, action, target_type, post_id, reason, created_at
      ) values (
        p_admin_id, p_action, 'post', p_target_id, normalized_reason, action_time
      );
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
        purge_at = case when p_action = 'delete' then action_time + interval '1 year' else null end
      where id = p_target_id;

      update public.community_reports
      set status = 'resolved', resolved_at = action_time
      where comment_id = p_target_id and status = 'open';

      insert into public.community_moderation_actions (
        admin_id, action, target_type, comment_id, reason, created_at
      ) values (
        p_admin_id, p_action, 'comment', p_target_id, normalized_reason, action_time
      );
    end if;
  elsif p_action = 'restrict' then
    if p_target_type <> 'user'
      or p_target_id is not null
      or p_user_id is null
      or p_until is null
      or p_until <= action_time
    then
      raise exception using errcode = '22023', message = 'invalid community restriction';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('community-moderation:user:' || p_user_id::text, 0)
    );

    insert into public.community_sanctions (
      user_id, reason, ends_at, created_by, starts_at
    ) values (
      p_user_id, normalized_reason, p_until, p_admin_id, action_time
    );

    insert into public.community_moderation_actions (
      admin_id, action, target_type, user_id, reason, created_at
    ) values (
      p_admin_id, 'restrict', 'user', p_user_id, normalized_reason, action_time
    );
  else
    raise exception using errcode = '22023', message = 'invalid moderation action';
  end if;
end;
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
  action_time timestamptz := now();
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

  select user_id into sanction_user_id
  from public.community_sanctions
  where id = p_sanction_id and revoked_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'community sanction not found';
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

create or replace view public.community_admin_content as
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
  c.created_at
from public.community_comments c;

revoke all on function public.delete_community_content_by_author(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_community_content_by_author(uuid, text, uuid)
  to service_role;

revoke all on function public.moderate_community_content(uuid, text, text, uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.moderate_community_content(uuid, text, text, uuid, uuid, timestamptz, text)
  to service_role;

revoke all on function public.revoke_community_sanction(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_community_sanction(uuid, uuid, text)
  to service_role;

revoke all on public.community_admin_content from anon, authenticated;
grant select on public.community_admin_content to service_role;
