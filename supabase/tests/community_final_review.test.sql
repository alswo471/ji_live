begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
values
  (md5('final-admin')::uuid, 'final-admin@example.invalid', '{}'::jsonb, false),
  (md5('final-author')::uuid, null, '{}'::jsonb, true),
  (md5('final-author-two')::uuid, null, '{}'::jsonb, true),
  (md5('final-natural-old')::uuid, null, '{}'::jsonb, true),
  (md5('final-natural-young')::uuid, null, '{}'::jsonb, true),
  (md5('final-natural-hold')::uuid, null, '{}'::jsonb, true);

insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
select
  md5('final-reporter-' || value)::uuid,
  null,
  '{}'::jsonb,
  true
from generate_series(1, 14) value;

insert into public.community_admins (user_id)
values (md5('final-admin')::uuid);

insert into public.community_posts (
  id, author_id, author_name, title, body, status, deletion_source,
  deleted_at, purge_at, idempotency_key, created_at
) values
  ('91000000-0000-4000-8000-000000000001', md5('final-author')::uuid,
   '검증-작성자', '신고 key 검증', '24시간 abuse key 파기 검증', 'visible', null,
   null, null, '92000000-0000-4000-8000-000000000001', '2026-09-01T00:00:00Z'),
  ('91000000-0000-4000-8000-000000000002', md5('final-author')::uuid,
   '검증-작성자', '자동 숨김 검증', '서로 다른 네트워크 10건 신고 검증', 'visible', null,
   null, null, '92000000-0000-4000-8000-000000000002', '2026-09-01T00:00:00Z'),
  ('91000000-0000-4000-8000-000000000003', md5('final-author')::uuid,
   '검증-작성자', '부모 그래프 검증', '일반 자식 댓글이 있는 삭제 게시글', 'deleted', 'author',
   '2025-09-03T12:00:00Z', '2026-09-03T12:00:00Z',
   '92000000-0000-4000-8000-000000000003', '2025-09-01T00:00:00Z'),
  ('91000000-0000-4000-8000-000000000004', md5('final-author')::uuid,
   '검증-작성자', 'legal hold 해제 검증', '해제된 hold 후 다음 실행에서 파기', 'deleted', 'author',
   '2025-09-03T12:00:00Z', '2026-09-03T12:00:00Z',
   '92000000-0000-4000-8000-000000000004', '2025-09-01T00:00:00Z'),
  ('91000000-0000-4000-8000-000000000005', md5('final-author')::uuid,
   '검증-작성자', '신고 기각 검증', '공개 콘텐츠의 신고를 비징계적으로 종료', 'visible', null,
   null, null, '92000000-0000-4000-8000-000000000005', '2026-09-01T00:00:00Z'),
  ('91000000-0000-4000-8000-000000000006', md5('final-author')::uuid,
   '검증-작성자', '작성자 삭제 신고 종료', '작성자 삭제와 신고 종료의 원자성 검증', 'visible', null,
   null, null, '92000000-0000-4000-8000-000000000006', '2026-09-01T00:00:00Z'),
  ('91000000-0000-4000-8000-000000000007', md5('final-author-two')::uuid,
   '검증-작성자2', '제재 원자성 검증', '신고에서 작성 제한까지 한 transaction', 'visible', null,
   null, null, '92000000-0000-4000-8000-000000000007', '2026-09-01T00:00:00Z'),
  ('91000000-0000-4000-8000-000000000008', md5('final-author')::uuid,
   '검증-작성자', '관리자 숨김 metadata', '숨김 주체 사유 시각과 멱등성 검증', 'visible', null,
   null, null, '92000000-0000-4000-8000-000000000008', '2026-09-01T00:00:00Z');

insert into public.community_comments (
  id, post_id, author_id, author_name, body, status, deletion_source,
  deleted_at, purge_at, idempotency_key, created_at,
  hidden_source, hidden_reason, hidden_at
) values
  ('93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003',
   md5('final-author')::uuid, '검증-작성자', '부모에 속한 공개 댓글', 'visible', null,
   null, null, '94000000-0000-4000-8000-000000000001', '2025-09-02T00:00:00Z',
   null, null, null),
  ('93000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000003',
   md5('final-author')::uuid, '검증-작성자', '부모에 속한 숨김 댓글', 'hidden', null,
   null, null, '94000000-0000-4000-8000-000000000002', '2025-09-02T00:00:00Z',
   'admin', '이전 관리자 숨김', '2025-09-02T01:00:00Z'),
  ('93000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003',
   md5('final-author')::uuid, '검증-작성자', '독립 보존 기한이 남은 삭제 댓글', 'deleted', 'author',
   '2025-09-05T12:00:00Z', '2026-09-05T12:00:00Z',
   '94000000-0000-4000-8000-000000000003', '2025-09-02T00:00:00Z',
   null, null, null),
  ('93000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000004',
   md5('final-author')::uuid, '검증-작성자', 'hold 해제 후 함께 파기될 댓글', 'visible', null,
   null, null, '94000000-0000-4000-8000-000000000004', '2025-09-02T00:00:00Z',
   null, null, null);

insert into public.community_reports (
  id, reporter_id, reporter_abuse_key, reporter_abuse_key_expires_at,
  post_id, comment_id, reason, detail, status, created_at, resolved_at
) values
  ('95000000-0000-4000-8000-000000000003', md5('final-reporter-3')::uuid,
   repeat('a3', 32), '2025-09-04T12:00:00Z', null, '93000000-0000-4000-8000-000000000001',
   'spam', '오래된 의존 신고', 'resolved', '2025-09-03T12:00:00Z', '2025-09-03T12:00:00Z'),
  ('95000000-0000-4000-8000-000000000004', md5('final-reporter-4')::uuid,
   repeat('a4', 32), '2025-09-06T12:00:00Z', null, '93000000-0000-4000-8000-000000000002',
   'spam', '최근 의존 신고', 'resolved', '2025-09-05T12:00:00Z', '2025-09-05T12:00:00Z'),
  ('95000000-0000-4000-8000-000000000005', md5('final-reporter-5')::uuid,
   repeat('a5', 32), '2026-09-05T12:00:00Z', '91000000-0000-4000-8000-000000000005', null,
   'other', '기각할 신고', 'open', '2026-09-04T12:00:00Z', null),
  ('95000000-0000-4000-8000-000000000006', md5('final-reporter-6')::uuid,
   repeat('a6', 32), '2026-09-05T12:00:00Z', '91000000-0000-4000-8000-000000000006', null,
   'other', '작성자 삭제로 종료될 신고', 'open', '2026-09-04T12:00:00Z', null),
  ('95000000-0000-4000-8000-000000000007', md5('final-reporter-7')::uuid,
   repeat('a7', 32), '2026-09-05T12:00:00Z', '91000000-0000-4000-8000-000000000007', null,
   'spam', '제재로 해결할 신고', 'open', '2026-09-04T12:00:00Z', null);

insert into public.community_moderation_actions (
  id, admin_id, action, target_type, post_id, comment_id, reason, created_at,
  target_title_snapshot, target_body_snapshot, deletion_source
) values
  ('96000000-0000-4000-8000-000000000001', md5('final-admin')::uuid,
   'delete', 'post', '91000000-0000-4000-8000-000000000003', null,
   '오래된 의존 조치', '2025-09-03T12:00:00Z', '부모 그래프 검증', '이전 본문', 'admin'),
  ('96000000-0000-4000-8000-000000000002', md5('final-admin')::uuid,
   'hide', 'comment', null, '93000000-0000-4000-8000-000000000002',
   '최근 의존 조치', '2025-09-05T12:00:00Z', null, '부모에 속한 숨김 댓글', null);

insert into public.community_sanctions (
  id, user_id, reason, starts_at, ends_at, created_by, created_at, revoked_at
) values
  ('97000000-0000-4000-8000-000000000001', md5('final-natural-old')::uuid,
   '자연 만료 366일 경계', '2025-08-30T12:00:00Z', '2025-09-03T12:00:00Z',
   md5('final-admin')::uuid, '2025-08-30T12:00:00Z', null),
  ('97000000-0000-4000-8000-000000000002', md5('final-natural-young')::uuid,
   '자연 만료 364일 경계', '2025-09-01T12:00:00Z', '2025-09-05T12:00:00Z',
   md5('final-admin')::uuid, '2025-09-01T12:00:00Z', null),
  ('97000000-0000-4000-8000-000000000003', md5('final-natural-hold')::uuid,
   'hold가 있는 자연 만료 제재', '2025-08-30T12:00:00Z', '2025-09-03T12:00:00Z',
   md5('final-admin')::uuid, '2025-08-30T12:00:00Z', null);

insert into public.community_legal_holds (
  id, subject_type, subject_id, reason, created_by
) values
  ('98000000-0000-4000-8000-000000000001', 'post', '91000000-0000-4000-8000-000000000004',
   '부모 graph 법적 보존', md5('final-admin')::uuid),
  ('98000000-0000-4000-8000-000000000002', 'user', md5('final-natural-hold')::uuid,
   '제재 사용자 법적 보존', md5('final-admin')::uuid);

select lives_ok(
  $$ select public.moderate_community_content(
    md5('final-admin')::uuid, 'dismiss', 'post',
    '91000000-0000-4000-8000-000000000005', null, null,
    '정책 위반이 아닌 신고 기각',
    '95000000-0000-4000-8000-000000000005'
  ) $$,
  'an admin can dismiss one unfounded report on visible content'
);
select is(
  (select status::text from public.community_posts where id = '91000000-0000-4000-8000-000000000005'),
  'visible',
  'dismiss leaves visible content unchanged'
);
select is(
  (select status::text from public.community_reports where id = '95000000-0000-4000-8000-000000000005'),
  'dismissed',
  'dismiss closes the selected report non-punitively'
);
select is(
  (select count(*)::integer from public.community_moderation_actions
   where action = 'dismiss' and post_id = '91000000-0000-4000-8000-000000000005'),
  1,
  'dismiss writes one privacy-safe audit action'
);

select lives_ok(
  $$ select public.delete_community_content_by_author(
    md5('final-author')::uuid, 'post', '91000000-0000-4000-8000-000000000006'
  ) $$,
  'author deletion remains atomic'
);
select is(
  (select status::text from public.community_reports where id = '95000000-0000-4000-8000-000000000006'),
  'dismissed',
  'author deletion closes matching open reports non-punitively'
);
select lives_ok(
  $$ select public.moderate_community_content(
    md5('final-admin')::uuid, 'restore', 'post',
    '91000000-0000-4000-8000-000000000006', null, null,
    '작성자 삭제 복구 스냅샷', null
  ) $$,
  'admin can restore author-deleted content with a deletion-source snapshot'
);
select is(
  (select deletion_source from public.community_moderation_actions
   where action = 'restore' and post_id = '91000000-0000-4000-8000-000000000006'),
  'author',
  'restore audit preserves the historical author deletion source'
);

select lives_ok(
  $$ select public.moderate_community_content(
    md5('final-admin')::uuid, 'hide', 'post',
    '91000000-0000-4000-8000-000000000008', null, null,
    '관리자가 직접 숨김 조치', null
  ) $$,
  'admin hide succeeds once'
);
select ok(
  (select hidden_source = 'admin'
     and hidden_reason = '관리자가 직접 숨김 조치'
     and hidden_at is not null
   from public.community_posts where id = '91000000-0000-4000-8000-000000000008'),
  'admin hide records source reason and action timestamp'
);
select throws_ok(
  $$ select public.moderate_community_content(
    md5('final-admin')::uuid, 'hide', 'post',
    '91000000-0000-4000-8000-000000000008', null, null,
    '중복 숨김은 충돌로 처리', null
  ) $$,
  'P0001',
  'community moderation state conflict',
  'hide-on-hidden is a stale terminal transition'
);
select is(
  (select count(*)::integer from public.community_moderation_actions
   where action = 'hide' and post_id = '91000000-0000-4000-8000-000000000008'),
  1,
  'rejected duplicate hide does not add another audit action'
);
select lives_ok(
  $$ select public.moderate_community_content(
    md5('final-admin')::uuid, 'delete', 'post',
    '91000000-0000-4000-8000-000000000008', null, null,
    '관리자 삭제 스냅샷 기록', null
  ) $$,
  'admin can move hidden content to deletion pending'
);
select ok(
  (select deletion_source = 'admin'
     and target_title_snapshot = '관리자 숨김 metadata'
     and target_body_snapshot = '숨김 주체 사유 시각과 멱등성 검증'
   from public.community_moderation_actions
   where action = 'delete' and post_id = '91000000-0000-4000-8000-000000000008'),
  'audit keeps searchable content and historical deletion-source snapshots'
);

select lives_ok(
  $$ select public.moderate_community_content(
    md5('final-admin')::uuid, 'restrict', 'post',
    '91000000-0000-4000-8000-000000000007', null, now() + interval '1 day',
    '반복적인 운영정책 위반 제재',
    '95000000-0000-4000-8000-000000000007'
  ) $$,
  'restriction and report disposition succeed in one transaction'
);
select is(
  (select status::text from public.community_reports where id = '95000000-0000-4000-8000-000000000007'),
  'resolved',
  'report-driven restriction resolves its report'
);
select is(
  (select count(*)::integer from public.community_sanctions
   where user_id = md5('final-author-two')::uuid and revoked_at is null and ends_at > now()),
  1,
  'report-driven restriction creates one active sanction'
);

insert into public.community_reports (
  id, reporter_id, reporter_abuse_key, reporter_abuse_key_expires_at,
  post_id, reason, detail, status, created_at
) values (
  '95000000-0000-4000-8000-000000000008', md5('final-reporter-8')::uuid,
  repeat('a8', 32), now() + interval '24 hours',
  '91000000-0000-4000-8000-000000000007', 'spam', '중복 제재 신고', 'open', now()
);

select throws_ok(
  $$ select public.moderate_community_content(
    md5('final-admin')::uuid, 'restrict', 'post',
    '91000000-0000-4000-8000-000000000007', null, now() + interval '2 days',
    '활성 제재와 겹치되는 제재',
    '95000000-0000-4000-8000-000000000008'
  ) $$,
  'P0001',
  'community moderation state conflict',
  'an overlapping active sanction is rejected deterministically'
);
select is(
  (select status::text from public.community_reports where id = '95000000-0000-4000-8000-000000000008'),
  'open',
  'a rejected restriction leaves its report open atomically'
);

select lives_ok(
  $$ select public.revoke_community_sanction(
    md5('final-admin')::uuid,
    (select id from public.community_sanctions where user_id = md5('final-author-two')::uuid),
    '운영 검토 후 제재 해제'
  ) $$,
  'an active sanction can be revoked once'
);
select throws_ok(
  $$ select public.revoke_community_sanction(
    md5('final-admin')::uuid,
    (select id from public.community_sanctions where user_id = md5('final-author-two')::uuid),
    '이미 해제된 제재 재해제'
  ) $$,
  'P0001',
  'community moderation state conflict',
  're-revoking an existing sanction returns a conflict'
);
select throws_ok(
  $$ select public.revoke_community_sanction(
    md5('final-admin')::uuid, '97000000-0000-4000-8000-000000000099',
    '존재하지 않는 제재 해제'
  ) $$,
  'P0002',
  'community sanction not found',
  'a missing sanction remains not found'
);

select lives_ok(
  $$ select public.submit_community_report(
    md5('final-reporter-9')::uuid, repeat('b1', 32), 'post',
    '91000000-0000-4000-8000-000000000002', 'privacy', '개인정보 즉시 숨김'
  ) $$,
  'automatic report hiding succeeds'
);
select ok(
  (select hidden_source = 'automatic'
     and hidden_reason is not null
     and hidden_at is not null
   from public.community_posts where id = '91000000-0000-4000-8000-000000000002'),
  'automatic hiding records source reason and timestamp'
);

update public.community_posts
set status = 'visible', hidden_source = null, hidden_reason = null, hidden_at = null
where id = '91000000-0000-4000-8000-000000000002';
delete from public.community_reports
where post_id = '91000000-0000-4000-8000-000000000002';

select public.submit_community_report(
  md5('final-reporter-' || value)::uuid,
  lpad(to_hex(value), 64, '0'),
  'post', '91000000-0000-4000-8000-000000000002', 'spam', '서로 다른 네트워크'
)
from generate_series(1, 10) value;

select is(
  (select status::text from public.community_posts where id = '91000000-0000-4000-8000-000000000002'),
  'hidden',
  'ten fresh distinct network keys still trigger automatic hiding'
);

insert into public.community_reports (
  id, reporter_id, reporter_abuse_key, reporter_abuse_key_expires_at,
  post_id, comment_id, reason, detail, status, created_at, resolved_at
) values
  ('95000000-0000-4000-8000-000000000001', md5('final-reporter-1')::uuid,
   repeat('a1', 32), '2026-09-04T13:00:00Z', '91000000-0000-4000-8000-000000000001', null,
   'spam', '23시간 key', 'open', '2026-09-03T13:00:00Z', null),
  ('95000000-0000-4000-8000-000000000002', md5('final-reporter-2')::uuid,
   repeat('a2', 32), '2026-09-04T11:00:00Z', '91000000-0000-4000-8000-000000000001', null,
   'spam', '25시간 key', 'open', '2026-09-03T11:00:00Z', null);

select lives_ok(
  $$ select public.run_community_retention('2026-09-04T12:00:00Z') $$,
  'the first retention pass completes'
);
select ok(
  (select reporter_abuse_key is not null from public.community_reports
   where id = '95000000-0000-4000-8000-000000000001'),
  'a report abuse key younger than 24 hours remains available for counting'
);
select ok(
  (select reporter_abuse_key is null from public.community_reports
   where id = '95000000-0000-4000-8000-000000000002'),
  'a report abuse key older than 24 hours is scrubbed'
);
select is(
  (select count(*)::integer from public.community_reports
   where id = '95000000-0000-4000-8000-000000000003'),
  0,
  'an old dependent report is purged on the first pass'
);
select is(
  (select count(*)::integer from public.community_moderation_actions
   where id = '96000000-0000-4000-8000-000000000001'),
  0,
  'an old dependent action is purged on the first pass'
);
select is(
  (select count(*)::integer from public.community_reports
   where id = '95000000-0000-4000-8000-000000000004'),
  1,
  'a recent dependent report keeps its one-year retention'
);
select is(
  (select count(*)::integer from public.community_moderation_actions
   where id = '96000000-0000-4000-8000-000000000002'),
  1,
  'a recent dependent action keeps its one-year retention'
);
select is(
  (select count(*)::integer from public.community_posts
   where id = '91000000-0000-4000-8000-000000000003'),
  1,
  'the parent waits while independently retained dependents remain'
);
select is(
  (select count(*)::integer from public.community_comments
   where post_id = '91000000-0000-4000-8000-000000000003'),
  3,
  'visible hidden and independently deleted children remain with a deferred parent'
);
select is(
  (select count(*)::integer from public.community_posts
   where id = '91000000-0000-4000-8000-000000000004'),
  1,
  'an active legal hold defers a purgeable parent graph'
);
select is(
  (select count(*)::integer from public.community_sanctions
   where id = '97000000-0000-4000-8000-000000000001'),
  0,
  'a naturally expired sanction older than one year is purged'
);
select is(
  (select count(*)::integer from public.community_sanctions
   where id = '97000000-0000-4000-8000-000000000002'),
  1,
  'a naturally expired sanction younger than one year is retained'
);
select is(
  (select count(*)::integer from public.community_sanctions
   where id = '97000000-0000-4000-8000-000000000003'),
  1,
  'an active user legal hold preserves a naturally expired sanction'
);

update public.community_legal_holds
set released_at = '2026-09-04T13:00:00Z'
where id in (
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000002'
);

select lives_ok(
  $$ select public.run_community_retention('2026-09-06T12:00:00Z') $$,
  'the second retention pass completes after deadlines and hold release'
);
select is(
  (select count(*)::integer from public.community_posts
   where id = '91000000-0000-4000-8000-000000000003'),
  0,
  'the eligible deleted parent is purged on a later pass'
);
select is(
  (select count(*)::integer from public.community_comments
   where post_id = '91000000-0000-4000-8000-000000000003'),
  0,
  'visible hidden and deadline-eligible deleted children purge with the parent'
);
select is(
  (select count(*)::integer from public.community_reports
   where id = '95000000-0000-4000-8000-000000000004'),
  0,
  'the formerly recent dependent report purges after its own deadline'
);
select is(
  (select count(*)::integer from public.community_moderation_actions
   where id = '96000000-0000-4000-8000-000000000002'),
  0,
  'the formerly recent dependent action purges after its own deadline'
);
select is(
  (select count(*)::integer from public.community_posts
   where id = '91000000-0000-4000-8000-000000000004'),
  0,
  'a released hold no longer blocks parent purging'
);
select is(
  (select count(*)::integer from public.community_comments
   where post_id = '91000000-0000-4000-8000-000000000004'),
  0,
  'ordinary child comments purge after the parent hold is released'
);
select is(
  (select count(*)::integer from public.community_sanctions
   where id = '97000000-0000-4000-8000-000000000003'),
  0,
  'a released user hold no longer blocks naturally expired sanction purging'
);

select * from finish();
rollback;
