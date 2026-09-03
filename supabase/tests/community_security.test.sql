begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email, raw_user_meta_data)
select
  md5(i::text)::uuid,
  'community-test-' || i || '@example.invalid',
  '{}'::jsonb
from generate_series(1, 12) as i;

select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.community_profiles'::regclass,
      'public.community_posts'::regclass,
      'public.community_comments'::regclass,
      'public.community_reports'::regclass,
      'public.community_sanctions'::regclass,
      'public.community_moderation_actions'::regclass,
      'public.community_rate_events'::regclass,
      'public.community_admins'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  8,
  'RLS is enabled and forced on every community table'
);

select ok(
  not has_table_privilege('anon', 'public.community_posts', 'INSERT'),
  'anon cannot insert posts directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.community_comments', 'UPDATE'),
  'authenticated cannot update comments directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.community_reports', 'INSERT'),
  'authenticated cannot insert reports directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.consume_community_rate_limit(uuid,text,text,integer,integer)',
    'EXECUTE'
  ),
  'anon cannot execute the security definer rate RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.consume_community_rate_limit(uuid,text,text,integer,integer)',
    'EXECUTE'
  ),
  'service_role can execute the rate RPC'
);

select is(
  public.consume_community_rate_limit(
    md5('1')::uuid,
    repeat('a', 64),
    'post',
    1,
    600
  ),
  true,
  'the first rate-limited action is allowed'
);

select is(
  public.consume_community_rate_limit(
    md5('1')::uuid,
    repeat('a', 64),
    'post',
    1,
    600
  ),
  false,
  'the next action over the same limit is rejected'
);

insert into public.community_posts (
  id,
  author_id,
  author_name,
  title,
  body,
  idempotency_key
)
values (
  '10000000-0000-0000-0000-000000000001',
  md5('1')::uuid,
  '테스트-작성자-0001',
  '일반 신고 테스트',
  '열 번째 유효 신고에서 숨김 처리되어야 합니다.',
  '20000000-0000-0000-0000-000000000001'
);

do $$
declare
  i integer;
begin
  for i in 1..9 loop
    perform public.submit_community_report(
      md5(i::text)::uuid,
      repeat(lpad(i::text, 2, '0'), 32),
      'post',
      '10000000-0000-0000-0000-000000000001',
      'spam',
      ''
    );
  end loop;
end;
$$;

select is(
  (
    select status::text
    from public.community_posts
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'visible',
  'nine valid general reports keep the post visible'
);

select is(
  (
    public.submit_community_report(
      md5('10')::uuid,
      repeat('10', 32),
      'post',
      '10000000-0000-0000-0000-000000000001',
      'spam',
      ''
    ) ->> 'temporarilyHidden'
  )::boolean,
  true,
  'the tenth valid general report triggers temporary hiding'
);

select is(
  (
    select status::text
    from public.community_posts
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'hidden',
  'the post is hidden at ten valid general reports'
);

insert into public.community_posts (
  id,
  author_id,
  author_name,
  title,
  body,
  idempotency_key
)
values (
  '10000000-0000-0000-0000-000000000002',
  md5('2')::uuid,
  '테스트-작성자-0002',
  '긴급 신고 테스트',
  '개인정보 또는 불법 신고 한 건에서 숨김 처리되어야 합니다.',
  '20000000-0000-0000-0000-000000000002'
);

select is(
  (
    public.submit_community_report(
      md5('11')::uuid,
      repeat('11', 32),
      'post',
      '10000000-0000-0000-0000-000000000002',
      'privacy',
      ''
    ) ->> 'temporarilyHidden'
  )::boolean,
  true,
  'one privacy report triggers temporary hiding'
);

select is(
  (
    select status::text
    from public.community_posts
    where id = '10000000-0000-0000-0000-000000000002'
  ),
  'hidden',
  'the urgent-report target is hidden immediately'
);

select * from finish();

rollback;
