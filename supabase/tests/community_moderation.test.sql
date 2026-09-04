begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

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

select ok(
  not has_function_privilege(
    'anon',
    'public.delete_community_content_by_author(uuid,text,uuid)',
    'EXECUTE'
  ),
  'anon cannot execute author delete RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.delete_community_content_by_author(uuid,text,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute author delete RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.delete_community_content_by_author(uuid,text,uuid)',
    'EXECUTE'
  ),
  'service_role can execute author delete RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.revoke_community_sanction(uuid,uuid,text)',
    'EXECUTE'
  ),
  'anon cannot execute sanction revoke RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.revoke_community_sanction(uuid,uuid,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute sanction revoke RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.revoke_community_sanction(uuid,uuid,text)',
    'EXECUTE'
  ),
  'service_role can execute sanction revoke RPC'
);

select ok(
  not has_table_privilege('anon', 'public.community_admin_content', 'SELECT'),
  'anon cannot select the admin content view'
);

select ok(
  not has_table_privilege('authenticated', 'public.community_admin_content', 'SELECT'),
  'authenticated cannot select the admin content view'
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
  $$ select public.delete_community_content_by_author(
    md5('102')::uuid, 'post',
    '60000000-0000-0000-0000-000000000001'
  ) $$,
  'author delete is atomic'
);

select is(
  (select deletion_source from public.community_posts
   where id = '60000000-0000-0000-0000-000000000001'),
  'author',
  'author deletion is distinguishable'
);

select ok(
  (select purge_at = deleted_at + interval '1 year' from public.community_posts
   where id = '60000000-0000-0000-0000-000000000001'),
  'author deletion receives a one-year purge time'
);

select lives_ok(
  $$ select public.moderate_community_content(
    md5('101')::uuid, 'restore', 'post',
    '60000000-0000-0000-0000-000000000001', null, null,
    '작성자 삭제 복구 처리'
  ) $$,
  'admin can restore author-deleted content'
);

select is(
  (select status::text from public.community_posts where id = '60000000-0000-0000-0000-000000000001'),
  'visible',
  'author-deleted content is restored to visible'
);

select ok(
  (select deletion_source is null and deleted_at is null and purge_at is null
   from public.community_posts where id = '60000000-0000-0000-0000-000000000001'),
  'restoring author-deleted content clears deletion metadata'
);

select lives_ok(
  $$ select public.moderate_community_content(
    md5('101')::uuid, 'delete', 'post',
    '60000000-0000-0000-0000-000000000001', null, null,
    '관리자 삭제 처리'
  ) $$,
  'admin delete is atomic'
);

select is(
  (select deletion_source from public.community_posts
   where id = '60000000-0000-0000-0000-000000000001'),
  'admin',
  'admin deletion is distinguishable'
);

select ok(
  (select purge_at = deleted_at + interval '1 year' from public.community_posts
   where id = '60000000-0000-0000-0000-000000000001'),
  'admin deletion receives a one-year purge time'
);

select lives_ok(
  $$ select public.moderate_community_content(
    md5('101')::uuid, 'restore', 'post',
    '60000000-0000-0000-0000-000000000001', null, null,
    '관리자 삭제 복구 처리'
  ) $$,
  'admin can restore admin-deleted content'
);

select is(
  (select status::text from public.community_posts where id = '60000000-0000-0000-0000-000000000001'),
  'visible',
  'admin-deleted content is restored to visible'
);

select ok(
  (select deletion_source is null and deleted_at is null and purge_at is null
   from public.community_posts where id = '60000000-0000-0000-0000-000000000001'),
  'restoring admin-deleted content clears deletion metadata'
);

select throws_ok(
  $$ select public.moderate_community_content(
    md5('101')::uuid, 'restore', 'post',
    '60000000-0000-0000-0000-000000000001', null, null,
    '이미 공개된 콘텐츠 복구 시도'
  ) $$,
  'P0001',
  'community moderation state conflict',
  'restoring visible content reports a state conflict'
);

select throws_ok(
  $$ select public.moderate_community_content(
    md5('101')::uuid, 'hide', 'post',
    '60000000-0000-0000-0000-000000000099', null, null,
    '파기된 콘텐츠 숨김 시도'
  ) $$,
  'P0002',
  'community moderation target not found',
  'a missing content target remains not found'
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
  (select count(*)::integer from public.community_sanctions where user_id = md5('102')::uuid and ends_at > now() and revoked_at is null),
  1,
  'restriction creates one active sanction'
);

select lives_ok(
  $$ select public.revoke_community_sanction(
    md5('101')::uuid,
    (select id from public.community_sanctions where user_id = md5('102')::uuid and revoked_at is null),
    '제재 해제 사유 기록'
  ) $$,
  'admin can revoke an active sanction'
);

select ok(
  (select revoked_at is not null from public.community_sanctions
   where user_id = md5('102')::uuid),
  'sanction revocation records its timestamp'
);

select is(
  (select count(*)::integer from public.community_moderation_actions
   where user_id = md5('102')::uuid and action = 'unrestrict'),
  1,
  'sanction revocation writes one unrestrict audit action'
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

select throws_ok(
  $$
    insert into public.community_posts (
      author_id, author_name, title, body, idempotency_key, status,
      deletion_source, deleted_at, purge_at
    ) values (
      md5('102')::uuid, '테스트-작성자-0102', '삭제 주체 누락 게시글', '삭제 주체가 없는 삭제 게시글은 거부되어야 합니다.',
      '61000000-0000-0000-0000-000000000002', 'deleted', null, now(), now() + interval '1 year'
    )
  $$,
  '23514',
  'new row for relation "community_posts" violates check constraint "community_posts_deletion_metadata_check"',
  'deleted posts require a deletion source'
);

select throws_ok(
  $$
    insert into public.community_comments (
      post_id, author_id, author_name, body, idempotency_key, status,
      deletion_source, deleted_at, purge_at
    ) values (
      '60000000-0000-0000-0000-000000000001', md5('102')::uuid, '테스트-작성자-0102',
      '삭제 주체가 없는 삭제 댓글은 거부되어야 합니다.', '62000000-0000-0000-0000-000000000001',
      'deleted', null, now(), now() + interval '1 year'
    )
  $$,
  '23514',
  'new row for relation "community_comments" violates check constraint "community_comments_deletion_metadata_check"',
  'deleted comments require a deletion source'
);

select * from finish();

rollback;
