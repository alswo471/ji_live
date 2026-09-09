import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

function sql(statement: string) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_ji-live',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
    ],
    { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
}

describe.runIf(process.env.RUN_LOCAL_SUPABASE_TESTS === 'true')(
  'local reply transactions (isolated fixtures)',
  () => {
    it('validates linkage, retries, redaction, grants and orphan survival without changing existing data', () => {
      const actor = randomUUID(),
        post = randomUUID(),
        otherPost = randomUUID(),
        root = randomUUID(),
        key = randomUUID();
      const result = sql(`begin;
      insert into auth.users(id,is_anonymous) values('${actor}',true);
      insert into public.community_posts(id,author_id,author_name,title,body,idempotency_key) values
        ('${post}','${actor}','검증 작성자','검증 제목','검증 본문',gen_random_uuid()),
        ('${otherPost}','${actor}','검증 작성자','검증 제목','검증 본문',gen_random_uuid());
      insert into public.community_comments(id,post_id,author_id,author_name,body,idempotency_key) values('${root}','${post}','${actor}','비밀 작성자','비밀 원문',gen_random_uuid());
      do $$ declare child uuid; retry uuid; payload jsonb; v_role text; begin
        child := (public.create_community_comment('${actor}','${post}','검증 작성자','답글 😀','${key}','${root}')->>'id')::uuid;
        retry := (public.create_community_comment('${actor}','${post}','검증 작성자','답글 😀','${key}','${root}')->>'id')::uuid;
        if child <> retry then raise exception 'idempotency failed'; end if;
        begin perform public.create_community_comment('${actor}','${post}','검증 작성자','다른 본문','${key}','${root}'); raise exception 'mismatched key accepted'; exception when unique_violation then null; end;
        begin perform public.create_community_comment('${actor}','${otherPost}','검증 작성자','답글 😀','${key}',null); raise exception 'different post key accepted'; exception when unique_violation then null; end;
        begin perform public.create_community_comment('${actor}','${post}','검증 작성자','답글 😀','${key}',null); raise exception 'different parent key accepted'; exception when unique_violation then null; end;
        begin perform public.create_community_comment('${actor}','${post}','검증 작성자',repeat('가',1001),gen_random_uuid(),null); raise exception 'oversize input accepted'; exception when invalid_parameter_value then null; end;
        begin perform public.create_community_comment('${actor}','${otherPost}','검증 작성자','답글',gen_random_uuid(),'${root}'); raise exception 'cross post accepted'; exception when no_data_found then null; end;
        begin perform public.create_community_comment('${actor}','${post}','검증 작성자','답글',gen_random_uuid(),child); raise exception 'nested reply accepted'; exception when no_data_found then null; end;
        begin update public.community_comments set parent_comment_id=null where id=child; raise exception 'reparent accepted'; exception when insufficient_privilege then null; end;
        update public.community_comments set status='hidden',hidden_source='automatic',hidden_reason='검증 숨김',hidden_at=now() where id='${root}';
        begin perform public.create_community_comment('${actor}','${post}','비밀 작성자','비밀 원문',(select idempotency_key from public.community_comments where id='${root}'),null); raise exception 'hidden retry returned original'; exception when no_data_found then null; end;
        payload := public.read_community_comments('${post}',null,null,null,31);
        if payload::text like '%비밀%' or payload->0->>'author_id' is not null or payload->0->>'unavailable' <> 'true' then raise exception 'hidden root leaked: %',payload; end if;
        if jsonb_array_length(public.read_community_comments('${post}','${root}',null,null,31)) <> 1 then raise exception 'hidden root lost replies'; end if;
        begin perform public.create_community_comment('${actor}','${post}','검증 작성자','답글',gen_random_uuid(),'${root}'); raise exception 'hidden parent accepted'; exception when no_data_found then null; end;
        perform public.delete_community_content_by_author('${actor}','comment','${root}');
        begin perform public.create_community_comment('${actor}','${post}','검증 작성자','답글',gen_random_uuid(),'${root}'); raise exception 'deleted parent accepted'; exception when no_data_found then null; end;
        if jsonb_array_length(public.read_community_comments('${post}','${root}',null,null,31)) <> 1 then raise exception 'deleted root lost replies'; end if;
        update public.community_posts set status='hidden',hidden_source='automatic',hidden_reason='검증 숨김',hidden_at=now() where id='${post}';
        if jsonb_array_length(public.read_community_comments('${post}','${root}',null,null,31)) <> 0 then raise exception 'hidden post leaked'; end if;
        update public.community_posts set status='visible',hidden_source=null,hidden_reason=null,hidden_at=null where id='${post}';
        delete from public.community_comments where id='${root}';
        if not exists(select 1 from public.community_comments where id=child and parent_comment_id is null) then raise exception 'orphan lost'; end if;
        foreach v_role in array array['anon','authenticated'] loop
          if has_function_privilege(v_role,'public.create_community_comment(uuid,uuid,text,text,uuid,uuid)','EXECUTE') or has_function_privilege(v_role,'public.read_community_comments(uuid,uuid,timestamp with time zone,uuid,integer)','EXECUTE') then raise exception 'public RPC grant'; end if;
          if has_column_privilege(v_role,'public.community_comments','parent_comment_id','INSERT') or has_column_privilege(v_role,'public.community_comments','parent_comment_id','UPDATE') then raise exception 'public link grant'; end if;
        end loop;
        insert into public.community_admins(user_id) values('${actor}');
        insert into public.community_sanctions(user_id,reason,ends_at,created_by) values('${actor}','답글 제한 검증',now()+interval '1 day','${actor}');
        begin perform public.create_community_comment('${actor}','${post}','검증 작성자','답글',gen_random_uuid(),null); raise exception 'sanction ignored'; exception when insufficient_privilege then null; end;
      end $$;
      rollback;`);
      expect(result).toContain('ROLLBACK');
    });

    it('denies actual public RPC calls and inserts, but allows service RPC writes', () => {
      const actor = randomUUID(),
        post = randomUUID(),
        root = randomUUID();
      const seed = `begin; insert into auth.users(id,is_anonymous) values('${actor}',true);
      insert into public.community_posts(id,author_id,author_name,title,body,idempotency_key) values('${post}','${actor}','검증 작성자','검증 제목','본문',gen_random_uuid());
      insert into public.community_comments(id,post_id,author_id,author_name,body,idempotency_key) values('${root}','${post}','${actor}','검증 작성자','원댓글',gen_random_uuid());`;
      const write = `select public.create_community_comment('${actor}','${post}','검증 작성자','답글',gen_random_uuid(),'${root}');`;
      for (const role of ['anon', 'authenticated']) {
        for (const statement of [
          write,
          `select public.read_community_comments('${post}',null,null,null,31);`,
          `insert into public.community_comments(post_id,author_id,author_name,body,idempotency_key,parent_comment_id) values('${post}','${actor}','검증 작성자','답글',gen_random_uuid(),'${root}');`,
          `update public.community_comments set parent_comment_id=null where id='${root}';`,
        ]) {
          expect(() =>
            sql(`${seed} set local role ${role}; ${statement} rollback;`),
          ).toThrow(/permission denied/);
        }
      }
      expect(
        sql(`${seed} set local role service_role; ${write} rollback;`),
      ).toContain('ROLLBACK');
      expect(() =>
        sql(
          `${seed} set local role service_role; insert into public.community_comments(post_id,author_id,author_name,body,idempotency_key,parent_comment_id) values('${post}','${actor}','검증 작성자','답글',gen_random_uuid(),'${root}'); rollback;`,
        ),
      ).toThrow('use community comment writer');
    });

    it('paginates root and reply SQL rows at microsecond precision and hides private replies', () => {
      const actor = randomUUID(),
        post = randomUUID(),
        root = randomUUID(),
        newer = randomUUID(),
        older = randomUUID();
      expect(
        sql(`begin;
      insert into auth.users(id,is_anonymous) values('${actor}',true);
      insert into public.community_posts(id,author_id,author_name,title,body,idempotency_key) values('${post}','${actor}','검증 작성자','검증 제목','본문',gen_random_uuid());
      insert into public.community_comments(id,post_id,author_id,author_name,body,idempotency_key,created_at) values
        ('${root}','${post}','${actor}','검증 작성자','원댓글',gen_random_uuid(),'2026-09-09T01:00:00Z');
      insert into public.community_comments(id,post_id,author_id,author_name,body,idempotency_key,parent_comment_id,created_at) values
        ('${newer}','${post}','${actor}','검증 작성자','최신 답글',gen_random_uuid(),'${root}','2026-09-09T01:00:00.123456Z'),
        ('${older}','${post}','${actor}','검증 작성자','이전 답글',gen_random_uuid(),'${root}','2026-09-09T01:00:00.123455Z');
      do $$ declare first_page jsonb; second_page jsonb; begin
        first_page := public.read_community_comments('${post}','${root}',null,null,1);
        if first_page->0->>'id' <> '${newer}' or first_page->0->>'created_at' <> '2026-09-09T01:00:00.123456+00:00' then raise exception 'newest/microsecond order lost'; end if;
        second_page := public.read_community_comments('${post}','${root}',(first_page->0->>'created_at')::timestamptz,(first_page->0->>'id')::uuid,1);
        if second_page->0->>'id' <> '${older}' then raise exception 'page omission'; end if;
        if jsonb_array_length(public.read_community_comments('${post}',null,null,null,31)) <> 1 then raise exception 'reply leaked into roots'; end if;
        perform public.delete_community_content_by_author('${actor}','comment','${newer}');
        if jsonb_array_length(public.read_community_comments('${post}','${root}',null,null,31)) <> 1 then raise exception 'private reply leaked'; end if;
        if public.read_community_comments('${post}',null,null,null,31)->0->>'reply_count' <> '1' then raise exception 'private reply counted'; end if;
      end $$; rollback;`),
      ).toContain('ROLLBACK');
    });

    it('waits for a concurrent parent hide and rejects the reply after the hide commits', async () => {
      const actor = randomUUID(),
        post = randomUUID(),
        root = randomUUID();
      sql(`insert into auth.users(id,is_anonymous) values('${actor}',true);
      insert into public.community_posts(id,author_id,author_name,title,body,idempotency_key) values('${post}','${actor}','검증 작성자','검증 제목','본문',gen_random_uuid());
      insert into public.community_comments(id,post_id,author_id,author_name,body,idempotency_key) values('${root}','${post}','${actor}','검증 작성자','원댓글',gen_random_uuid());`);
      try {
        const child = spawn('docker', [
          'exec',
          '-i',
          'supabase_db_ji-live',
          'psql',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-At',
        ]);
        const finished = new Promise<void>((resolve, reject) => {
          child.once('error', reject);
          child.once('exit', (code) =>
            code === 0
              ? resolve()
              : reject(new Error(`hide transaction exited ${code}`)),
          );
        });
        const locked = new Promise<void>((resolve, reject) => {
          child.once('error', reject);
          child.stdout.on('data', (chunk) => {
            if (String(chunk).includes('parent-locked')) resolve();
          });
        });
        child.stdin.end(
          `begin; set local statement_timeout='5s'; update public.community_comments set status='hidden',hidden_source='automatic',hidden_reason='동시성 검증',hidden_at=now() where id='${root}'; select 'parent-locked'; select pg_sleep(0.3); commit;`,
        );
        await locked;
        expect(() =>
          sql(
            `set statement_timeout='5s'; select public.create_community_comment('${actor}','${post}','검증 작성자','답글',gen_random_uuid(),'${root}');`,
          ),
        ).toThrow('community parent comment not found');
        await finished;
        expect(
          sql(
            `select count(*) from public.community_comments where post_id='${post}';`,
          ),
        ).toBe('1');
      } finally {
        sql(
          `delete from public.community_comments where post_id='${post}'; delete from public.community_posts where id='${post}'; delete from auth.users where id='${actor}';`,
        );
      }
    });
  },
);
