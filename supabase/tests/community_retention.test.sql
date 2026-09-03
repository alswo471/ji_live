begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data, is_anonymous, created_at, last_sign_in_at)
values
  (md5('retention-admin')::uuid, 'retention-admin@example.invalid', '{}'::jsonb, false, now(), now()),
  (md5('retention-old-anon')::uuid, null, '{}'::jsonb, true, now() - interval '100 days', now() - interval '100 days'),
  (md5('retention-author')::uuid, null, '{}'::jsonb, true, now() - interval '100 days', now() - interval '1 day');

insert into public.community_admins (user_id) values (md5('retention-admin')::uuid);

insert into public.community_posts (
  id, author_id, author_name, title, body, status, deleted_at, idempotency_key, created_at
) values
  ('71000000-0000-0000-0000-000000000001', md5('retention-author')::uuid,
   '테스트-작성자', '파기 대상', '30일이 지난 삭제 콘텐츠', 'deleted', now() - interval '31 days',
   '72000000-0000-0000-0000-000000000001', now() - interval '31 days'),
  ('71000000-0000-0000-0000-000000000002', md5('retention-author')::uuid,
   '테스트-작성자', '보존 대상', 'legal hold가 설정된 콘텐츠', 'deleted', now() - interval '31 days',
   '72000000-0000-0000-0000-000000000002', now() - interval '31 days');

insert into public.community_legal_holds (
  subject_type, subject_id, reason, created_by
) values (
  'post', '71000000-0000-0000-0000-000000000002', '진행 중인 권리 분쟁 보존', md5('retention-admin')::uuid
);

insert into public.community_rate_events (actor_id, abuse_key, action, created_at)
values (md5('retention-author')::uuid, repeat('cd', 32), 'post', now() - interval '25 hours');

select ok(
  not has_function_privilege('anon', 'public.run_community_retention(timestamptz)', 'EXECUTE'),
  'anon cannot execute retention RPC'
);
select ok(
  has_function_privilege('service_role', 'public.run_community_retention(timestamptz)', 'EXECUTE'),
  'service role can execute retention RPC'
);

select lives_ok(
  $$ select public.run_community_retention(now()) $$,
  'retention RPC completes'
);

select is(
  (select count(*)::integer from public.community_rate_events where abuse_key = repeat('cd', 32)),
  0,
  'rate events older than 24 hours are deleted'
);
select is(
  (select count(*)::integer from public.community_posts where id = '71000000-0000-0000-0000-000000000001'),
  0,
  'deleted content older than 30 days is deleted'
);
select is(
  (select count(*)::integer from public.community_posts where id = '71000000-0000-0000-0000-000000000002'),
  1,
  'active legal hold preserves content'
);
select is(
  (select count(*)::integer from auth.users where id = md5('retention-old-anon')::uuid),
  0,
  'inactive anonymous user without content is deleted'
);
select is(
  (
    select count(*)::integer
    from jsonb_object_keys(public.run_community_retention(now()))
  ),
  6,
  'retention returns counts only'
);

select * from finish();
rollback;
