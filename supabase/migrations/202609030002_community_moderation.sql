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

    if target_status is null or target_status = 'deleted' then
      raise exception using errcode = 'P0002', message = 'community moderation target not found';
    end if;

    if p_target_type = 'post' then
      update public.community_posts
      set
        status = case
          when p_action = 'hide' then 'hidden'::public.community_content_status
          when p_action = 'restore' then 'visible'::public.community_content_status
          else 'deleted'::public.community_content_status
        end,
        deleted_at = case when p_action = 'delete' then now() else null end
      where id = p_target_id;

      update public.community_reports
      set status = 'resolved', resolved_at = now()
      where post_id = p_target_id and status = 'open';

      insert into public.community_moderation_actions (
        admin_id, action, target_type, post_id, reason
      ) values (
        p_admin_id, p_action, 'post', p_target_id, normalized_reason
      );
    else
      update public.community_comments
      set
        status = case
          when p_action = 'hide' then 'hidden'::public.community_content_status
          when p_action = 'restore' then 'visible'::public.community_content_status
          else 'deleted'::public.community_content_status
        end,
        deleted_at = case when p_action = 'delete' then now() else null end
      where id = p_target_id;

      update public.community_reports
      set status = 'resolved', resolved_at = now()
      where comment_id = p_target_id and status = 'open';

      insert into public.community_moderation_actions (
        admin_id, action, target_type, comment_id, reason
      ) values (
        p_admin_id, p_action, 'comment', p_target_id, normalized_reason
      );
    end if;
  elsif p_action = 'restrict' then
    if p_target_type <> 'user'
      or p_target_id is not null
      or p_user_id is null
      or p_until is null
      or p_until <= now()
    then
      raise exception using errcode = '22023', message = 'invalid community restriction';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('community-moderation:user:' || p_user_id::text, 0)
    );

    insert into public.community_sanctions (
      user_id, reason, ends_at, created_by
    ) values (
      p_user_id, normalized_reason, p_until, p_admin_id
    );

    insert into public.community_moderation_actions (
      admin_id, action, target_type, user_id, reason
    ) values (
      p_admin_id, 'restrict', 'user', p_user_id, normalized_reason
    );
  else
    raise exception using errcode = '22023', message = 'invalid moderation action';
  end if;
end;
$$;

revoke all on function public.moderate_community_content(uuid, text, text, uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.moderate_community_content(uuid, text, text, uuid, uuid, timestamptz, text)
  to service_role;
