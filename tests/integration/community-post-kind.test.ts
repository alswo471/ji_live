import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listPosts } from '@/lib/community/read-service';
import type { CommunityReadRepository } from '@/lib/community/repository';

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
  'local post kind transactions',
  () => {
    const admin = randomUUID();
    const other = randomUUID();
    const actor = randomUUID();
    function create(kind: string, key = randomUUID(), by = admin) {
      return `select public.create_community_admin_post('${by}','종류-검증-0001','종류 검증','본문',null,'${key}','${kind}')::text;`;
    }
    function deny(statement: string, code: string) {
      expect(() => sql(`\\set VERBOSITY verbose\n${statement}`)).toThrow(code);
    }
    beforeAll(() => {
      sql(`insert into auth.users(id, is_anonymous) values ('${admin}',false),('${other}',false),('${actor}',false);
      insert into public.community_admins(user_id) values ('${admin}'),('${other}');`);
    });
    afterAll(() => {
      sql(`delete from public.community_moderation_actions where admin_id in ('${admin}','${other}');
      delete from public.community_posts where author_id in ('${admin}','${other}','${actor}');
      delete from public.community_admins where user_id in ('${admin}','${other}');
      delete from auth.users where id in ('${admin}','${other}','${actor}');`);
    });
    it('atomically creates each exact kind and records one audit for a retried request', () => {
      for (const kind of ['normal', 'notice', 'required']) {
        const key = randomUUID();
        const first = JSON.parse(sql(create(kind, key))) as { id: string };
        expect(JSON.parse(sql(create(kind, key))).id).toBe(first.id);
        expect(
          sql(
            `select kind from public.community_posts where id='${first.id}';`,
          ),
        ).toBe(kind);
        expect(
          sql(
            `select count(*) from public.community_moderation_actions where post_id='${first.id}' and action='kind_change';`,
          ),
        ).toBe('1');
        expect(
          sql(
            `select previous_kind is null and new_kind='${kind}' and target_body_snapshot is null from public.community_moderation_actions where post_id='${first.id}';`,
          ),
        ).toBe('t');
      }
    });
    it('rejects another author’s key, invalid kind and ordinary actor without partial inserts', () => {
      const key = randomUUID();
      sql(create('notice', key));
      deny(create('required', key, other), '42501');
      deny(create('invalid'), '22023');
      deny(create('required', randomUUID(), actor), '42501');
      expect(
        sql(
          `select count(*) from public.community_posts where author_id='${actor}';`,
        ),
      ).toBe('0');
    });
    it('allows changing and unpinning visible posts, with no duplicate audit on no-op', () => {
      const { id } = JSON.parse(sql(create('notice')));
      for (const kind of ['required', 'normal', 'normal']) {
        expect(
          JSON.parse(
            sql(
              `select public.set_community_post_kind('${admin}','${id}','${kind}')::text;`,
            ),
          ).kind,
        ).toBe(kind);
      }
      expect(
        sql(`select kind_rank from public.community_posts where id='${id}';`),
      ).toBe('0');
      expect(
        sql(
          `select count(*) from public.community_moderation_actions where post_id='${id}';`,
        ),
      ).toBe('3');
      deny(
        `select public.set_community_post_kind('${actor}','${id}','required');`,
        '42501',
      );
    });
    it('never restores hidden or deleted posts through a kind change or idempotent retry', () => {
      for (const status of ['hidden', 'deleted']) {
        const key = randomUUID();
        const { id } = JSON.parse(sql(create('notice', key)));
        sql(
          `select public.moderate_community_content('${admin}','${status === 'hidden' ? 'hide' : 'delete'}','post','${id}',null,null,'종류 변경 차단 검증');`,
        );
        deny(
          `select public.set_community_post_kind('${admin}','${id}','required');`,
          'P0002',
        );
        deny(create('notice', key), 'P0002');
        expect(
          sql(`select status from public.community_posts where id='${id}';`),
        ).toBe(status);
      }
    });
    it('denies public RPC execution and ordinary service insert/update kind elevation', () => {
      for (const role of ['anon', 'authenticated']) {
        deny(`set role ${role}; ${create('required')}`, '42501');
        deny(
          `set role ${role}; select public.set_community_post_kind('${admin}','${randomUUID()}','required');`,
          '42501',
        );
        deny(
          `set role ${role}; insert into public.community_posts(author_id,author_name,title,body,idempotency_key,kind) values('${actor}','검증-이름','제목','본문','${randomUUID()}','required');`,
          '42501',
        );
      }
      const { id } = JSON.parse(sql(create('normal')));
      deny(
        `set role service_role; update public.community_posts set kind='required' where id='${id}';`,
        '42501',
      );
      deny(
        `set role service_role; insert into public.community_posts(author_id,author_name,title,body,idempotency_key,kind) values('${actor}','검증-이름','제목','본문','${randomUUID()}','required');`,
        '42501',
      );
      expect(
        sql(
          `set role service_role; insert into public.community_posts(author_id,author_name,title,body,idempotency_key) values('${actor}','검증-이름','제목','본문','${randomUUID()}') returning kind;`,
        ),
      ).toContain('normal');
    });
    it('paginates real mixed-precision PostgreSQL timestamps through the read service without omission', async () => {
      const timestamps = [
        '2026-09-09T01:02:03.123456+00:00',
        '2026-09-09T01:02:03.123+00:00',
        '2026-09-09T01:02:03+00:00',
      ];
      const ids: string[] = [];
      for (const createdAt of timestamps) {
        const { id } = JSON.parse(sql(create('notice')));
        ids.push(id);
        sql(
          `update public.community_posts set created_at='${createdAt}' where id='${id}';`,
        );
      }
      const repository: CommunityReadRepository = {
        findPost: async () => null,
        findComments: async () => [],
        findPosts: async ({ cursor, limit }) =>
          JSON.parse(
            sql(`select coalesce(json_agg(p),'[]') from (
          select id,kind,author_id as "authorId",author_name as "authorName",title,body,link_url as "linkUrl",status,
            created_at as "createdAt",0 as "commentCount",0 as "viewCount",0 as "recommendationCount"
          from public.community_posts where id in (${ids.map((id) => `'${id}'`).join(',')}) and status='visible'
          ${cursor ? `and (kind_rank,created_at,id) < (${cursor.kindRank},'${cursor.createdAt}'::timestamptz,'${cursor.id}'::uuid)` : ''}
          order by kind_rank desc,created_at desc,id desc limit ${limit}
        ) p;`),
          ),
      };
      const seen: string[] = [];
      const dates: string[] = [];
      let cursor: string | null = null;
      for (let index = 0; index < 3; index++) {
        const page = await listPosts(cursor, 1, repository);
        expect(page.items).toHaveLength(1);
        seen.push(page.items[0].id);
        dates.push(page.items[0].createdAt);
        cursor = page.nextCursor;
        if (index < 2) expect(cursor).not.toBeNull();
      }
      expect(seen).toEqual(ids);
      expect(dates).toEqual(timestamps);
      expect(cursor).toBeNull();
    });
    it('preserves rank/date/id order across page boundaries and excludes non-visible rows', () => {
      const ids: string[] = [];
      for (const kind of [
        'normal',
        'notice',
        'required',
        'notice',
        'required',
        'normal',
      ]) {
        ids.push(JSON.parse(sql(create(kind))).id);
      }
      sql(
        `update public.community_posts set created_at='2026-01-01T00:00:00Z' where id in (${ids.map((id) => `'${id}'`).join(',')});`,
      );
      const base = `from public.community_posts where id in (${ids.map((id) => `'${id}'`).join(',')}) and status='visible'`;
      const order = 'order by kind_rank desc,created_at desc,id desc';
      const expected = sql(`select id ${base} ${order};`).split('\n');
      const seen: string[] = [];
      let cursor = '';
      while (seen.length < 6) {
        const page = JSON.parse(
          sql(
            `select coalesce(json_agg(p),'[]') from (select id,kind_rank,created_at ${base} ${cursor} ${order} limit 2) p;`,
          ),
        );
        expect(page).toHaveLength(2);
        seen.push(...page.map((row: { id: string }) => row.id));
        const last = page.at(-1);
        cursor = `and (kind_rank,created_at,id) < (${last.kind_rank},'${last.created_at}'::timestamptz,'${last.id}'::uuid)`;
      }
      expect(seen).toEqual(expected);
      expect(new Set(seen).size).toBe(6);
      expect(sql(`select string_agg(kind,',' ${order}) ${base};`)).toBe(
        'required,required,notice,notice,normal,normal',
      );
    });
  },
);
