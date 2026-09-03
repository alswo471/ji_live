begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data)
values
  (md5('101')::uuid, 'moderation-admin@example.invalid', '{}'::jsonb),
  (md5('102')::uuid, 'moderation-author@example.invalid', '{}'::jsonb),
  (md5('103')::uuid, 'moderation-reporter@example.invalid', '{}'::jsonb);

insert into public.community_admins (user_id) values (md5('101')::uuid);

insert into public.community_posts (
  id, author_id, author_name, title, body, idempotency_key
) values (
  '60000000-0000-0000-0000-000000000001',
  md5('102')::uuid,
  '테스트-작성자-0102',
  '관리 조치 테스트',
  '관리 조치와 신고 해결, audit 기록이 한 transaction에서 처리되어야 합니다.',
  '61000000-0000-0000-0000-000000000001'
);

select public.submit_community_report(
  md5('103')::uuid,
  repeat('ab', 32),
  'post',
  '60000000-0000-0000-0000-000000000001',
  'spam',
  '반복 광고 신고'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.moderate_community_content(uuid,text,text,uuid,uuid,timestamptz,text)',
    'EXECUTE'
  ),
  'anon cannot execute moderation RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.moderate_community_content(uuid,text,text,uuid,uuid,timestamptz,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute moderation RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.moderate_community_content(uuid,text,text,uuid,uuid,timestamptz,text)',
    'EXECUTE'
  ),
  'service_role can execute moderation RPC'
);

select throws_ok(
  $$
    select public.moderate_community_content(
      md5('102')::uuid, 'hide', 'post',
      '60000000-0000-0000-0000-000000000001', null, null,
      '권한 없는 사용자 조치'
    )
  $$,
  '42501',
  'community admin access denied',
  'a non-admin cannot moderate content'
);

select lives_ok(
  $$
    select public.moderate_community_content(
      md5('101')::uuid, 'hide', 'post',
      '60000000-0000-0000-0000-000000000001', null, null,
      '반복 광고로 숨김 처리'
    )
  $$,
  'a configured admin can hide content'
);

select is(
  (select status::text from public.community_posts where id = '60000000-0000-0000-0000-000000000001'),
  'hidden',
  'hide updates the target status'
);

select is(
  (select status::text from public.community_reports where post_id = '60000000-0000-0000-0000-000000000001'),
  'resolved',
  'content moderation resolves open reports in the same transaction'
);

select is(
  (select count(*)::integer from public.community_moderation_actions where post_id = '60000000-0000-0000-0000-000000000001'),
  1,
  'content moderation writes one audit action'
);

select lives_ok(
  $$
    select public.moderate_community_content(
      md5('101')::uuid, 'restrict', 'user', null,
      md5('102')::uuid, now() + interval '1 day',
      '반복적인 운영정책 위반'
    )
  $$,
  'a configured admin can restrict an author'
);

select is(
  (select count(*)::integer from public.community_sanctions where user_id = md5('102')::uuid and ends_at > now()),
  1,
  'restriction creates one active sanction'
);

select throws_ok(
  $$
    select public.moderate_community_content(
      md5('101')::uuid, 'restrict', 'user', null,
      md5('102')::uuid, now() - interval '1 second',
      '만료된 제한 시도 차단'
    )
  $$,
  '22023',
  'invalid community restriction',
  'an expired restriction is rejected'
);

select * from finish();

rollback;
