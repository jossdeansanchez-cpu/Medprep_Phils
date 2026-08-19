-- Show admins which exam each student is preparing for.
--
-- Since 0037 a plan is bought against a track and effective_plan() reports
-- 'free' the moment profiles.track and subscriptions.track disagree. The admin
-- Students list had no way to see any of that: it showed the purchased plan,
-- so a student who switched tracks appeared to be on Pro while actually being
-- on the free tier. Two people would read that table and reach opposite
-- conclusions about the same account.
--
-- Adds `track` (the exam they're studying for) and `plan_track` (the exam their
-- payment bought), and makes `plan` mean what the student actually gets.

drop function if exists public.list_students();

create function public.list_students()
returns table (
  id                 uuid,
  full_name          text,
  email              text,
  role               user_role,
  plan               plan_tier,
  status             text,
  is_paid            boolean,
  current_period_end timestamptz,
  device_count       bigint,
  created_at         timestamptz,
  track              public.exam_track,
  plan_track         public.exam_track
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
  select p.id, p.full_name, u.email::text, p.role,
         -- Mirrors effective_plan(): a lapsed period or a track mismatch both
         -- mean the student is on free, whatever they once bought. The old
         -- version checked neither, so this column now agrees with what the
         -- student actually experiences in the app.
         coalesce(
           case
             when s.status in ('active','trialing')
              and (s.current_period_end is null or s.current_period_end > now())
              and s.track = p.track
             then s.plan
           end,
           'free'::plan_tier
         ),
         coalesce(s.status, 'inactive'),
         (s.paymongo_last_payment_id is not null),
         s.current_period_end,
         (select count(*) from public.user_devices d where d.user_id = p.id),
         p.created_at,
         p.track,
         -- Null when they've never paid. Differs from `track` exactly when a
         -- student switched exams after subscribing — which is the case the
         -- admin needs to spot, because it looks like a billing fault.
         s.track
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.subscriptions s on s.user_id = p.id
  order by p.created_at desc;
end;
$fn$;
