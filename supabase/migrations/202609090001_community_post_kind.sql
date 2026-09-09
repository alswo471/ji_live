alter table public.community_posts
  add column kind text not null default 'normal' check (kind in ('normal', 'notice', 'required')),
  add column kind_rank integer generated always as (
    case kind when 'required' then 2 when 'notice' then 1 else 0 end
  ) stored;

create index community_posts_visible_kind_created_idx
  on public.community_posts (kind_rank desc, created_at desc, id desc)
  where status = 'visible';
grant select (kind, kind_rank) on public.community_posts to anon, authenticated;

-- Ordinary service writes keep their existing columns, but cannot elevate kind.
-- SECURITY DEFINER admin transactions below run as the migration owner.
revoke insert, update on public.community_posts from service_role;
do $$
declare columns text;
begin
  select string_agg(quote_ident(attname), ',') into columns
  from pg_attribute
  where attrelid = 'public.community_posts'::regclass and attnum > 0
    and not attisdropped and attname not in ('kind', 'kind_rank');
  execute format('grant insert (%s), update (%s) on public.community_posts to service_role', columns, columns);
end;
$$;

-- Reuse the existing one-year audit retention and target purge dependency.
-- No title/body snapshot is captured for kind operations.
alter table public.community_moderation_actions
  drop constraint community_moderation_actions_action_check,
  add constraint community_moderation_actions_action_check
    check (action in ('hide','restore','delete','dismiss','restrict','unrestrict','kind_change')),
  add column previous_kind text check (previous_kind in ('normal','notice','required')),
  add column new_kind text check (new_kind in ('normal','notice','required')),
  add constraint community_moderation_actions_kind_check check (
    (action = 'kind_change' and target_type = 'post' and new_kind is not null)
    or (action <> 'kind_change' and previous_kind is null and new_kind is null)
  );

create function public.community_post_kind_ready(p_admin_id uuid)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  perform 1 from public.community_admins a
    join auth.users u on u.id = a.user_id
    where a.user_id = p_admin_id and coalesce(u.is_anonymous, false) = false
    for share of a;
  if not found then
    raise exception using errcode = '42501', message = 'community admin access denied';
  end if;
  return true;
end;
$$;

create function public.create_community_admin_post(
  p_admin_id uuid, p_author_name text, p_title text, p_body text,
  p_link_url text, p_idempotency_key uuid, p_kind text
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  target public.community_posts%rowtype;
  author_name text;
begin
  perform public.community_post_kind_ready(p_admin_id);
  if p_kind is null or p_kind not in ('normal','notice','required') or p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'invalid community post kind';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('community-post-create:' || p_idempotency_key::text, 0));
  select * into target from public.community_posts where idempotency_key = p_idempotency_key for update;
  if found then
    if target.author_id <> p_admin_id then
      raise exception using errcode = '42501', message = 'community request owner mismatch';
    end if;
    if target.status <> 'visible' then
      raise exception using errcode = 'P0002', message = 'community post not found';
    end if;
    return jsonb_build_object('id', target.id);
  end if;
  if exists (select 1 from public.community_sanctions where user_id = p_admin_id and revoked_at is null and ends_at > now()) then
    raise exception using errcode = '42501', message = 'community actor restricted';
  end if;
  insert into public.community_profiles(user_id,display_name)
    values(p_admin_id,p_author_name) on conflict(user_id) do nothing;
  select display_name into author_name from public.community_profiles where user_id = p_admin_id;
  insert into public.community_posts(author_id,author_name,title,body,link_url,idempotency_key,kind)
    values(p_admin_id,author_name,p_title,p_body,p_link_url,p_idempotency_key,p_kind)
    returning * into target;
  insert into public.community_moderation_actions(admin_id,action,target_type,post_id,reason,previous_kind,new_kind)
    values(p_admin_id,'kind_change','post',target.id,'글 종류 지정: ' || p_kind,null,p_kind);
  return jsonb_build_object('id', target.id);
end;
$$;

create function public.set_community_post_kind(p_admin_id uuid, p_post_id uuid, p_kind text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare target public.community_posts%rowtype;
begin
  perform public.community_post_kind_ready(p_admin_id);
  if p_kind is null or p_kind not in ('normal','notice','required') then
    raise exception using errcode = '22023', message = 'invalid community post kind';
  end if;
  select * into target from public.community_posts where id = p_post_id for update;
  if not found or target.status <> 'visible' then
    raise exception using errcode = 'P0002', message = 'community post not found';
  end if;
  if target.kind <> p_kind then
    update public.community_posts set kind = p_kind where id = p_post_id;
    insert into public.community_moderation_actions(admin_id,action,target_type,post_id,reason,previous_kind,new_kind)
      values(p_admin_id,'kind_change','post',p_post_id,'글 종류 변경: ' || target.kind || ' → ' || p_kind,target.kind,p_kind);
  end if;
  return jsonb_build_object('kind', p_kind);
end;
$$;

revoke all on function public.community_post_kind_ready(uuid) from public, anon, authenticated;
revoke all on function public.create_community_admin_post(uuid,text,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.set_community_post_kind(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.community_post_kind_ready(uuid) to service_role;
grant execute on function public.create_community_admin_post(uuid,text,text,text,text,uuid,text) to service_role;
grant execute on function public.set_community_post_kind(uuid,uuid,text) to service_role;
