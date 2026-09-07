create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'community-retention-every-minute',
  '* * * * *',
  $job$select public.run_community_retention(now())$job$
);

create function public.get_community_retention_health()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, cron
as $$
  with retention_job as (
    select jobid, jobname, schedule, active
    from cron.job
    where jobname = 'community-retention-every-minute'
    limit 1
  ),
  latest_run as (
    select r.status, r.end_time
    from cron.job_run_details r
    join retention_job j on j.jobid = r.jobid
    where r.end_time is not null
    order by r.end_time desc
    limit 1
  )
  select jsonb_build_object(
    'jobName', j.jobname,
    'schedule', j.schedule,
    'active', j.active,
    'lastStatus', r.status,
    'lastFinishedAt', r.end_time
  )
  from retention_job j
  left join latest_run r on true;
$$;

revoke all on function public.get_community_retention_health() from public;
revoke all on function public.get_community_retention_health() from anon;
revoke all on function public.get_community_retention_health() from authenticated;
grant execute on function public.get_community_retention_health() to service_role;
