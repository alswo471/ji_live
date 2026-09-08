import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const runIntegration = process.env.RUN_LOCAL_SUPABASE_TESTS === 'true';
const container = 'supabase_db_ji-live';

function sql(statement: string) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      container,
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

function sqlAsync(statement: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('docker', [
      'exec',
      '-i',
      container,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr));
    });
    child.stdin.end(statement);
  });
}

function count(result: string, key: string) {
  const value = (JSON.parse(result) as Record<string, unknown>)[key];
  if (typeof value !== 'number') throw new Error(`missing ${key}`);
  return value;
}

describe.runIf(runIntegration)('local community engagement integration', () => {
  const actorOne = randomUUID();
  const actorTwo = randomUUID();
  const restrictedActor = randomUUID();
  const postId = randomUUID();
  const hiddenPostId = randomUUID();
  const deletedPostId = randomUUID();

  beforeAll(() => {
    const users = [actorOne, actorTwo, restrictedActor]
      .map(
        (id) =>
          `('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','engagement-${id}@example.invalid','',now(),now(),now(),false,true)`,
      )
      .join(',');
    sql(`
      insert into auth.users (
        instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        created_at,updated_at,is_sso_user,is_anonymous
      ) values ${users};
      insert into public.community_posts (
        id,author_id,author_name,title,body,idempotency_key,status,
        hidden_source,hidden_reason,hidden_at,deletion_source,deleted_at,purge_at
      ) values
        ('${postId}','${actorOne}','통합-작성자-0001','집계 통합 게시글','로컬 집계 검증','${randomUUID()}','visible',null,null,null,null,null,null),
        ('${hiddenPostId}','${actorOne}','통합-작성자-0001','숨김 게시글','로컬 집계 검증','${randomUUID()}','hidden','admin','집계 통합 검증',now(),null,null,null),
        ('${deletedPostId}','${actorOne}','통합-작성자-0001','삭제 게시글','로컬 집계 검증','${randomUUID()}','deleted',null,null,null,'author',now(),now() + interval '1 year');
      insert into public.community_sanctions (
        user_id,reason,ends_at,created_by
      )
      select '${restrictedActor}','집계 통합 제한 검증',now() + interval '1 day',user_id
      from public.community_admins limit 1;
    `);
  });

  afterAll(() => {
    sql(`
      delete from public.community_sanctions where user_id in ('${actorOne}','${actorTwo}','${restrictedActor}');
      delete from public.community_posts where id in ('${postId}','${hiddenPostId}','${deletedPostId}');
      delete from auth.users where id in ('${actorOne}','${actorTwo}','${restrictedActor}');
    `);
  });

  it('counts the same actor once per rolling 24 hours and different actors independently', () => {
    const first = sql(
      `select public.record_community_post_view('${postId}','${actorTwo}')::text;`,
    );
    const duplicate = sql(
      `select public.record_community_post_view('${postId}','${actorTwo}')::text;`,
    );
    const other = sql(
      `select public.record_community_post_view('${postId}','${actorOne}')::text;`,
    );
    expect(count(first, 'viewCount')).toBe(1);
    expect(count(duplicate, 'viewCount')).toBe(1);
    expect(count(other, 'viewCount')).toBe(2);

    sql(
      `update public.community_post_view_receipts set last_counted_at = clock_timestamp() - interval '23 hours 59 minutes' where post_id='${postId}' and actor_id='${actorTwo}';`,
    );
    expect(
      count(
        sql(
          `select public.record_community_post_view('${postId}','${actorTwo}')::text;`,
        ),
        'viewCount',
      ),
    ).toBe(2);
    sql(
      `update public.community_post_view_receipts set last_counted_at = clock_timestamp() - interval '24 hours' where post_id='${postId}' and actor_id='${actorTwo}';`,
    );
    expect(
      count(
        sql(
          `select public.record_community_post_view('${postId}','${actorTwo}')::text;`,
        ),
        'viewCount',
      ),
    ).toBe(3);
  });

  it('makes desired recommendation states idempotent without going negative', () => {
    const recommended = sql(
      `select public.set_community_post_recommendation('${postId}','${actorTwo}',true)::text;`,
    );
    const retried = sql(
      `select public.set_community_post_recommendation('${postId}','${actorTwo}',true)::text;`,
    );
    const cancelled = sql(
      `select public.set_community_post_recommendation('${postId}','${actorTwo}',false)::text;`,
    );
    const cancelledAgain = sql(
      `select public.set_community_post_recommendation('${postId}','${actorTwo}',false)::text;`,
    );
    expect(count(recommended, 'recommendationCount')).toBe(1);
    expect(count(retried, 'recommendationCount')).toBe(1);
    expect(count(cancelled, 'recommendationCount')).toBe(0);
    expect(count(cancelledAgain, 'recommendationCount')).toBe(0);
  });

  it('rejects self recommendation, non-visible posts, and restricted actors', () => {
    for (const [statement, expectedState] of [
      [
        `select public.set_community_post_recommendation('${postId}','${actorOne}',true);`,
        '42501',
      ],
      [
        `select public.set_community_post_recommendation('${hiddenPostId}','${actorTwo}',true);`,
        'P0002',
      ],
      [
        `select public.set_community_post_recommendation('${deletedPostId}','${actorTwo}',true);`,
        'P0002',
      ],
      [
        `select public.set_community_post_recommendation('${postId}','${restrictedActor}',true);`,
        '42501',
      ],
    ]) {
      expect(
        sql(`
          do $$
          begin
            begin
              perform (${statement.replace(/^select /, '').replace(/;$/, '')});
              raise exception 'engagement rejection unexpectedly succeeded';
            exception when others then
              if sqlstate <> '${expectedState}' then raise; end if;
            end;
          end $$;
        `),
      ).toBe('DO');
    }
  });

  it('serializes concurrent duplicate writes', async () => {
    sql(
      `delete from public.community_post_view_receipts where post_id='${postId}' and actor_id='${actorOne}';`,
    );
    const beforeViewCount = Number(
      sql(
        `select view_count from public.community_posts where id='${postId}';`,
      ),
    );
    const views = await Promise.all(
      Array.from({ length: 12 }, () =>
        sqlAsync(
          `select public.record_community_post_view('${postId}','${actorOne}')::text;`,
        ),
      ),
    );
    expect(
      views.every(
        (result) => count(result, 'viewCount') === beforeViewCount + 1,
      ),
    ).toBe(true);

    const desiredTrue = Array.from({ length: 12 }, () =>
      sqlAsync(
        `select public.set_community_post_recommendation('${postId}','${actorTwo}',true)::text;`,
      ),
    );
    const results = await Promise.all(desiredTrue);
    expect(
      results.every((result) => count(result, 'recommendationCount') === 1),
    ).toBe(true);
    const desiredFalse = await Promise.all(
      Array.from({ length: 12 }, () =>
        sqlAsync(
          `select public.set_community_post_recommendation('${postId}','${actorTwo}',false)::text;`,
        ),
      ),
    );
    expect(
      desiredFalse.every(
        (result) => count(result, 'recommendationCount') === 0,
      ),
    ).toBe(true);
  });

  it('denies direct anonymous writes and RPC execution', () => {
    const checks = sql(`
      do $$
      begin
        set local role anon;
        begin
          insert into public.community_post_view_receipts(post_id,actor_id) values ('${postId}','${actorTwo}');
          raise exception 'anonymous table write unexpectedly succeeded';
        exception when insufficient_privilege then null;
        end;
        begin
          perform public.record_community_post_view('${postId}','${actorTwo}');
          raise exception 'anonymous rpc unexpectedly succeeded';
        exception when insufficient_privilege then null;
        end;
      end $$;
      select 'denied';
    `);
    expect(checks).toBe('DO\ndenied');
  });

  it('has an active scheduled receipt cleanup path', () => {
    sql(
      `update public.community_post_view_receipts set last_counted_at=clock_timestamp() - interval '25 hours' where post_id='${postId}' and actor_id='${actorOne}';`,
    );
    expect(
      sql(
        `select public.cleanup_community_post_view_receipts(clock_timestamp());`,
      ),
    ).toBe('1');
    expect(
      sql(
        `select count(*) from public.community_post_view_receipts where post_id='${postId}' and actor_id='${actorOne}';`,
      ),
    ).toBe('0');
    expect(
      sql(
        `select count(*) from cron.job where jobname='community-view-receipts-hourly' and active;`,
      ),
    ).toBe('1');
  });
});
