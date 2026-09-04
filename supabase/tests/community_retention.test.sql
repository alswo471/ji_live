begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email, raw_user_meta_data, is_anonymous, created_at, last_sign_in_at)
values
  (md5('retention-admin')::uuid, 'retention-admin@example.invalid', '{}'::jsonb, false, now(), now()),
  (md5('retention-old-anon')::uuid, null, '{}'::jsonb, true, now() - interval '100 days', now() - interval '100 days'),
  (md5('retention-author')::uuid, null, '{}'::jsonb, true, now() - interval '100 days', now() - interval '1 day'),
  (md5('retention-report-old')::uuid, 'retention-report-old@example.invalid', '{}'::jsonb, false, now(), now()),
  (md5('retention-report-young')::uuid, 'retention-report-young@example.invalid', '{}'::jsonb, false, now(), now()),
  (md5('retention-report-hold')::uuid, 'retention-report-hold@example.invalid', '{}'::jsonb, false, now(), now()),
  (md5('retention-parent-dependent')::uuid, 'retention-parent-dependent@example.invalid', '{}'::jsonb, false, now(), now()),
  (md5('retention-sanction-old')::uuid, 'retention-sanction-old@example.invalid', '{}'::jsonb, false, now(), now()),
  (md5('retention-sanction-young')::uuid, 'retention-sanction-young@example.invalid', '{}'::jsonb, false, now(), now()),
  (md5('retention-sanction-hold')::uuid, 'retention-sanction-hold@example.invalid', '{}'::jsonb, false, now(), now());

insert into public.community_admins (user_id) values (md5('retention-admin')::uuid);

insert into public.community_posts (
  id, author_id, author_name, title, body, status, deletion_source, deleted_at, purge_at,
  idempotency_key, created_at
) values
  ('71000000-0000-0000-0000-000000000001', md5('retention-author')::uuid,
   '테스트-작성자', '파기 대상', '366일이 지난 삭제 콘텐츠', 'deleted', 'author',
   now() - interval '366 days', now() - interval '1 day',
   '72000000-0000-0000-0000-000000000001', now() - interval '366 days'),
  ('71000000-0000-0000-0000-000000000002', md5('retention-author')::uuid,
   '테스트-작성자', 'hold 보존 대상', 'legal hold가 설정된 삭제 콘텐츠', 'deleted', 'author',
   now() - interval '366 days', now() - interval '1 day',
   '72000000-0000-0000-0000-000000000002', now() - interval '366 days'),
  ('71000000-0000-0000-0000-000000000003', md5('retention-author')::uuid,
   '테스트-작성자', '364일 보존 대상', '1년보다 짧은 삭제 콘텐츠', 'deleted', 'author',
   now() - interval '364 days', now() + interval '1 day',
   '72000000-0000-0000-0000-000000000003', now() - interval '364 days'),
  ('71000000-0000-0000-0000-000000000004', md5('retention-author')::uuid,
   '테스트-작성자', '의존 레코드 보존 대상', '최근 의존 레코드가 있는 삭제 콘텐츠', 'deleted', 'author',
   now() - interval '366 days', now() - interval '1 day',
   '72000000-0000-0000-0000-000000000004', now() - interval '366 days');

insert into public.community_comments (
  id, post_id, author_id, author_name, body, status, deletion_source, deleted_at, purge_at,
  idempotency_key, created_at
) values
  ('73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000003',
   md5('retention-author')::uuid, '테스트-작성자', '366일이 지난 삭제 댓글', 'deleted', 'author',
   now() - interval '366 days', now() - interval '1 day',
   '74000000-0000-0000-0000-000000000001', now() - interval '366 days'),
  ('73000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000003',
   md5('retention-author')::uuid, '테스트-작성자', '364일 삭제 댓글', 'deleted', 'author',
   now() - interval '364 days', now() + interval '1 day',
   '74000000-0000-0000-0000-000000000002', now() - interval '364 days'),
  ('73000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-000000000003',
   md5('retention-author')::uuid, '테스트-작성자', 'hold가 설정된 삭제 댓글', 'deleted', 'author',
   now() - interval '366 days', now() - interval '1 day',
   '74000000-0000-0000-0000-000000000003', now() - interval '366 days'),
  ('73000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-000000000004',
   md5('retention-author')::uuid, '테스트-작성자', '최근 공개 댓글', 'visible',
   null, null, null, '74000000-0000-0000-0000-000000000004', now() - interval '1 day');

insert into public.community_reports (
  id, reporter_id, reporter_abuse_key, post_id, reason, detail, status, created_at, resolved_at
) values
  ('81000000-0000-0000-0000-000000000001', md5('retention-report-old')::uuid,
   repeat('ab', 32), '71000000-0000-0000-0000-000000000003', 'spam', '366일 신고', 'resolved',
   now() - interval '366 days', now() - interval '366 days'),
  ('81000000-0000-0000-0000-000000000002', md5('retention-report-young')::uuid,
   repeat('bc', 32), '71000000-0000-0000-0000-000000000002', 'spam', '364일 신고', 'resolved',
   now() - interval '364 days', now() - interval '364 days'),
  ('81000000-0000-0000-0000-000000000003', md5('retention-report-hold')::uuid,
   repeat('cd', 32), '71000000-0000-0000-0000-000000000002', 'spam', 'hold 신고', 'resolved',
   now() - interval '366 days', now() - interval '366 days'),
  ('81000000-0000-0000-0000-000000000004', md5('retention-parent-dependent')::uuid,
   repeat('de', 32), '71000000-0000-0000-0000-000000000004', 'spam', '진행 중인 신고', 'open',
   now() - interval '1 day', null);

insert into public.community_moderation_actions (
  id, admin_id, action, target_type, post_id, user_id, reason, created_at
) values
  ('82000000-0000-0000-0000-000000000001', md5('retention-admin')::uuid,
   'restrict', 'user', null, md5('retention-sanction-old')::uuid, '366일 운영 기록', now() - interval '366 days'),
  ('82000000-0000-0000-0000-000000000002', md5('retention-admin')::uuid,
   'restrict', 'user', null, md5('retention-sanction-young')::uuid, '364일 운영 기록', now() - interval '364 days'),
  ('82000000-0000-0000-0000-000000000003', md5('retention-admin')::uuid,
   'restrict', 'user', null, md5('retention-sanction-hold')::uuid, 'hold 운영 기록', now() - interval '366 days'),
  ('82000000-0000-0000-0000-000000000004', md5('retention-admin')::uuid,
   'delete', 'post', '71000000-0000-0000-0000-000000000004', null, '최근 운영 기록', now() - interval '364 days');

insert into public.community_sanctions (
  id, user_id, reason, starts_at, ends_at, created_by, created_at, revoked_at
) values
  ('83000000-0000-0000-0000-000000000001', md5('retention-sanction-old')::uuid,
   '366일 전에 해제된 제재', now() - interval '370 days', now() - interval '369 days',
   md5('retention-admin')::uuid, now() - interval '370 days', now() - interval '366 days'),
  ('83000000-0000-0000-0000-000000000002', md5('retention-sanction-young')::uuid,
   '364일 전에 해제된 제재', now() - interval '368 days', now() - interval '367 days',
   md5('retention-admin')::uuid, now() - interval '368 days', now() - interval '364 days'),
  ('83000000-0000-0000-0000-000000000003', md5('retention-sanction-hold')::uuid,
   'hold가 설정된 해제 제재', now() - interval '370 days', now() - interval '369 days',
   md5('retention-admin')::uuid, now() - interval '370 days', now() - interval '366 days');

insert into public.community_legal_holds (
  subject_type, subject_id, reason, created_by
) values
  ('post', '71000000-0000-0000-0000-000000000002', '진행 중인 권리 분쟁 보존', md5('retention-admin')::uuid),
  ('comment', '73000000-0000-0000-0000-000000000003', '진행 중인 댓글 분쟁 보존', md5('retention-admin')::uuid),
  ('report', '81000000-0000-0000-0000-000000000003', '진행 중인 신고 분쟁 보존', md5('retention-admin')::uuid),
  ('moderation_action', '82000000-0000-0000-0000-000000000003', '진행 중인 운영 분쟁 보존', md5('retention-admin')::uuid),
  ('user', md5('retention-sanction-hold')::uuid, '진행 중인 제재 분쟁 보존', md5('retention-admin')::uuid);

insert into public.community_rate_events (actor_id, abuse_key, action, created_at)
values (md5('retention-author')::uuid, repeat('ef', 32), 'post', now() - interval '25 hours');

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
  (select count(*)::integer from public.community_rate_events where abuse_key = repeat('ef', 32)),
  0,
  'rate events older than 24 hours are deleted'
);
select is(
  (select count(*)::integer from public.community_posts
   where id = '71000000-0000-0000-0000-000000000001'),
  0,
  'deleted content older than one year is purged'
);
select is(
  (select count(*)::integer from public.community_posts
   where id = '71000000-0000-0000-0000-000000000003'),
  1,
  'deleted content younger than one year is retained'
);
select is(
  (select count(*)::integer from public.community_posts
   where id = '71000000-0000-0000-0000-000000000002'),
  1,
  'active legal hold preserves content'
);
select is(
  (select count(*)::integer from public.community_comments
   where id = '73000000-0000-0000-0000-000000000004'),
  1,
  'recent comments survive a purgeable parent'
);
select is(
  (select count(*)::integer from public.community_reports
   where id = '81000000-0000-0000-0000-000000000004'),
  1,
  'open reports survive a purgeable parent'
);
select is(
  (select count(*)::integer from public.community_moderation_actions
   where id = '82000000-0000-0000-0000-000000000004'),
  1,
  'recent moderation actions survive a purgeable parent'
);
select is(
  (select count(*)::integer from public.community_posts
   where id = '71000000-0000-0000-0000-000000000004'),
  1,
  'parents with retained dependents are deferred'
);
select is(
  (select count(*)::integer from public.community_comments
   where id = '73000000-0000-0000-0000-000000000001'),
  0,
  'deleted comments older than one year are purged'
);
select is(
  (select count(*)::integer from public.community_comments
   where id = '73000000-0000-0000-0000-000000000002'),
  1,
  'deleted comments younger than one year are retained'
);
select is(
  (select count(*)::integer from public.community_comments
   where id = '73000000-0000-0000-0000-000000000003'),
  1,
  'active legal hold preserves deleted comments'
);
select is(
  (select count(*)::integer from public.community_reports
   where id = '81000000-0000-0000-0000-000000000001'),
  0,
  'resolved reports older than one year are purged'
);
select is(
  (select count(*)::integer from public.community_reports
   where id = '81000000-0000-0000-0000-000000000002'),
  1,
  'resolved reports younger than one year are retained'
);
select is(
  (select count(*)::integer from public.community_reports
   where id = '81000000-0000-0000-0000-000000000003'),
  1,
  'active legal hold preserves resolved reports'
);
select is(
  (select count(*)::integer from public.community_moderation_actions
   where id = '82000000-0000-0000-0000-000000000001'),
  0,
  'moderation actions older than one year are purged'
);
select is(
  (select count(*)::integer from public.community_moderation_actions
   where id = '82000000-0000-0000-0000-000000000002'),
  1,
  'moderation actions younger than one year are retained'
);
select is(
  (select count(*)::integer from public.community_moderation_actions
   where id = '82000000-0000-0000-0000-000000000003'),
  1,
  'active legal hold preserves moderation actions'
);
select is(
  (select count(*)::integer from public.community_sanctions
   where id = '83000000-0000-0000-0000-000000000001'),
  0,
  'revoked sanctions older than one year are purged'
);
select is(
  (select count(*)::integer from public.community_sanctions
   where id = '83000000-0000-0000-0000-000000000002'),
  1,
  'revoked sanctions younger than one year are retained'
);
select is(
  (select count(*)::integer from public.community_sanctions
   where id = '83000000-0000-0000-0000-000000000003'),
  1,
  'active user legal hold preserves revoked sanctions'
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
  7,
  'retention returns all deletion counts including sanctions'
);

select * from finish();
rollback;
