-- Additive only: retain existing comments, public grants, and retention jobs.
alter table public.community_comments
  add column parent_comment_id uuid references public.community_comments(id) on delete set null;

create index community_comments_parent_created_idx
  on public.community_comments(parent_comment_id, created_at desc, id desc)
  where status = 'visible';
create index community_comments_root_created_idx
  on public.community_comments(post_id, created_at desc, id desc)
  where parent_comment_id is null;

create function public.guard_community_comment_parent()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    -- SECURITY DEFINER writer runs as migration owner; direct service writes cannot link replies.
    if new.parent_comment_id is not null and current_user <> 'postgres' then
      raise exception using errcode = '42501', message = 'use community comment writer';
    end if;
  elsif new.parent_comment_id is distinct from old.parent_comment_id then
    -- FK SET NULL runs after the referenced row is gone. Arbitrary detach/reparent is forbidden.
    if not (old.parent_comment_id is not null and new.parent_comment_id is null
      and not exists(select 1 from public.community_comments where id = old.parent_comment_id)) then
      raise exception using errcode = '42501', message = 'community comment parent is immutable';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.post_id is distinct from old.post_id then
    raise exception using errcode = '42501', message = 'community comment post is immutable';
  end if;
  return new;
end;
$$;
create trigger community_comment_parent_guard
before insert or update of parent_comment_id, post_id on public.community_comments
for each row execute function public.guard_community_comment_parent();

create function public.create_community_comment(
  p_actor_id uuid, p_post_id uuid, p_author_name text, p_body text,
  p_idempotency_key uuid, p_parent_comment_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  post_status public.community_content_status;
  parent public.community_comments%rowtype;
  result public.community_comments%rowtype;
begin
  if p_actor_id is null or p_post_id is null or p_idempotency_key is null
    or p_author_name is null or char_length(p_author_name) not between 2 and 24
    or p_body is null or char_length(btrim(p_body)) not between 1 and 1000
    or p_body <> btrim(p_body) or p_body ~* '</?[a-z][^>]*>'
    or p_body ~* '(https?://|javascript:|data:)' then
    raise exception using errcode = '22023', message = 'invalid community comment input';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('community-comment-request:' || p_idempotency_key::text, 0));
  -- Shared lock order: post first, then parent. Status writers already lock the affected row.
  select status into post_status from public.community_posts where id = p_post_id for update;
  if post_status is distinct from 'visible'::public.community_content_status then
    raise exception using errcode = 'P0002', message = 'community post not found';
  end if;
  if exists(select 1 from public.community_sanctions
    where user_id = p_actor_id and revoked_at is null and ends_at > now()) then
    raise exception using errcode = '42501', message = 'community write restricted';
  end if;
  if p_parent_comment_id is not null then
    select * into parent from public.community_comments where id = p_parent_comment_id for update;
    if not found or parent.post_id <> p_post_id or parent.parent_comment_id is not null or parent.status <> 'visible' then
      raise exception using errcode = 'P0002', message = 'community parent comment not found';
    end if;
  end if;
  select * into result from public.community_comments where idempotency_key = p_idempotency_key for update;
  if found then
    if result.author_id <> p_actor_id or result.post_id <> p_post_id or result.body <> p_body
      or result.parent_comment_id is distinct from p_parent_comment_id then
      raise exception using errcode = '23505', message = 'community request payload conflict';
    end if;
    if result.status <> 'visible' then
      raise exception using errcode = 'P0002', message = 'community comment not found';
    end if;
  else
    insert into public.community_comments(post_id,author_id,author_name,body,idempotency_key,parent_comment_id)
    values(p_post_id,p_actor_id,p_author_name,p_body,p_idempotency_key,p_parent_comment_id)
    returning * into result;
  end if;
  return jsonb_build_object('id',result.id,'post_id',result.post_id,'author_id',result.author_id,
    'author_name',result.author_name,'body',result.body,'status',result.status,
    'created_at',result.created_at,'parent_comment_id',result.parent_comment_id);
end;
$$;

create function public.read_community_comments(
  p_post_id uuid, p_parent_comment_id uuid default null,
  p_before_created_at timestamptz default null, p_before_id uuid default null, p_limit integer default 31
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if p_post_id is null or p_limit is null or p_limit not between 1 and 31
    or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception using errcode = '22023', message = 'invalid community comment page';
  end if;
  if not exists(select 1 from public.community_posts where id = p_post_id and status = 'visible') then
    return '[]'::jsonb;
  end if;
  if p_parent_comment_id is not null and not exists(
    select 1 from public.community_comments where id = p_parent_comment_id and post_id = p_post_id and parent_comment_id is null
  ) then return '[]'::jsonb; end if;
  return (
    select coalesce(jsonb_agg(dto order by created_at desc,id desc),'[]'::jsonb)
    from (
      select c.id,c.created_at,jsonb_build_object(
        'id',c.id,'post_id',c.post_id,'parent_comment_id',c.parent_comment_id,
        'author_id',case when c.status = 'visible' then c.author_id else null end,
        'author_name',case when c.status = 'visible' then c.author_name else '' end,
        'body',case when c.status = 'visible' then c.body else '삭제·숨김 처리된 댓글입니다.' end,
        'status',c.status,'created_at',c.created_at,'unavailable',c.status <> 'visible',
        'reply_count',children.count
      ) as dto
      from public.community_comments c
      cross join lateral (select count(*) from public.community_comments r
        where r.parent_comment_id=c.id and r.post_id=p_post_id and r.status='visible') children
      where c.post_id=p_post_id and c.parent_comment_id is not distinct from p_parent_comment_id
        and (c.status='visible' or (p_parent_comment_id is null and children.count > 0))
        and (p_before_created_at is null or (c.created_at,c.id) < (p_before_created_at,p_before_id))
      order by c.created_at desc,c.id desc limit p_limit
    ) page
  );
end;
$$;

revoke all on function public.guard_community_comment_parent() from public,anon,authenticated;
revoke all on function public.create_community_comment(uuid,uuid,text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.read_community_comments(uuid,uuid,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.create_community_comment(uuid,uuid,text,text,uuid,uuid) to service_role;
grant execute on function public.read_community_comments(uuid,uuid,timestamptz,uuid,integer) to service_role;
