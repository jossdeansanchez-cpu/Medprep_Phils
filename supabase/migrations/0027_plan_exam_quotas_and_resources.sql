-- New plan model, enforced server-side in start_attempt:
--   free     1 practice exam / period, no mock exams
--   basic    unlimited practice, 2 mock exams / period
--   pro      unlimited practice, 10 mock exams / period
--   max_pro  unlimited everything + Resources library
-- Quotas reset each billing period. Admins are exempt so they can test.
--
-- Adds: entitlement_period_start(), plan_exam_limit(), my_exam_usage(),
-- a quota gate inside start_attempt, and the `resources` table (Max-Pro-only
-- RLS read policy).
--
-- Bodies recovered from the deployed migration history (version 20260727210953);
-- this file previously carried the comment above and no SQL at all.
--
-- Two things here are superseded later: entitlement_period_start() moves to a
-- plain UTC calendar month in 0032, and start_attempt gains the personal-preset
-- gate in 0035. Read those for the current definitions.

-- Start of the current quota window. Paid plans use their own 30-day billing
-- window (current_period_end is always period_start + 30 days, see
-- paymongo-fulfillment.ts); free users have no billing period, so they get the
-- UTC calendar month.
create or replace function public.entitlement_period_start()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.current_period_end - interval '30 days'
       from public.subscriptions s
      where s.user_id = auth.uid()
        and s.status in ('active','trialing')
        and s.current_period_end > now()),
    date_trunc('month', now() at time zone 'utc')
  );
$$;

-- Exams allowed per period for a plan. NULL means unlimited.
create or replace function public.plan_exam_limit(p plan_tier, p_is_mock boolean)
returns int
language sql
immutable
as $$
  select case
    when p_is_mock then
      case p when 'free' then 0 when 'basic' then 2 when 'pro' then 10 else null end
    else
      case p when 'free' then 1 else null end
  end;
$$;

-- Exams already started in the current period, split mock vs practice.
create or replace function public.my_exam_usage()
returns table (
  plan          plan_tier,
  period_start  timestamptz,
  mock_used     int,
  mock_limit    int,
  other_used    int,
  other_limit   int,
  unlimited     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select public.effective_plan() as plan,
           public.entitlement_period_start() as ps,
           public.is_admin() as admin
  ),
  used as (
    select
      count(*) filter (where t.category = 'mock_exam')  as mock_used,
      count(*) filter (where t.category <> 'mock_exam') as other_used
    from public.exam_attempts a
    join public.exam_templates t on t.id = a.template_id
    cross join me
    where a.user_id = auth.uid()
      and a.started_at >= me.ps
  )
  select me.plan, me.ps,
         used.mock_used::int,
         case when me.admin then null else public.plan_exam_limit(me.plan, true) end,
         used.other_used::int,
         case when me.admin then null else public.plan_exam_limit(me.plan, false) end,
         me.admin
  from me, used;
$$;

-- ── start_attempt: enforce the per-period exam quota ─────────────────────────
create or replace function public.start_attempt(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_attempt   uuid;
  v_qps       int;
  v_total     int;
  v_published boolean;
  v_category  public.exam_category;
  v_subjects  uuid[];
  v_count     int;
  v_plan      public.plan_tier;
  v_is_mock   boolean;
  v_limit     int;
  v_used      int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select questions_per_subject, total_questions, is_published, category, subject_ids
    into v_qps, v_total, v_published, v_category, v_subjects
  from public.exam_templates
  where id = p_template_id and deleted_at is null;

  if v_qps is null then
    raise exception 'Template not found';
  end if;
  if not v_published and not public.is_admin() then
    raise exception 'Template not available';
  end if;

  -- Quota check (admins exempt so they can always test).
  if not public.is_admin() then
    v_plan := public.effective_plan();
    v_is_mock := (v_category = 'mock_exam');
    v_limit := public.plan_exam_limit(v_plan, v_is_mock);

    if v_limit is not null then
      select count(*) into v_used
      from public.exam_attempts a
      join public.exam_templates t on t.id = a.template_id
      where a.user_id = v_uid
        and a.started_at >= public.entitlement_period_start()
        and (t.category = 'mock_exam') = v_is_mock;

      if v_used >= v_limit then
        if v_is_mock then
          if v_limit = 0 then
            raise exception 'Mock exams need a paid plan. Upgrade to unlock them.';
          else
            raise exception 'You have used all % mock exams on your plan this period. Upgrade for more.', v_limit;
          end if;
        else
          raise exception 'The free plan includes % exam per month. Upgrade to keep practising.', v_limit;
        end if;
      end if;
    end if;
  end if;

  insert into public.exam_attempts (user_id, template_id)
  values (v_uid, p_template_id)
  returning id into v_attempt;

  if v_total is not null and v_total > 0 then
    with subjects_in_scope as (
      select s.id as subject_id
      from public.subjects s
      where v_subjects is null or cardinality(v_subjects) = 0 or s.id = any(v_subjects)
    ),
    manual_ranked as (
      select q.id, q.subject_id,
             row_number() over (order by etq.created_at, q.id) as rn
      from public.exam_template_questions etq
      join public.questions q on q.id = etq.question_id
      where etq.template_id = p_template_id
        and q.is_active and q.deleted_at is null
        and q.subject_id in (select subject_id from subjects_in_scope)
    ),
    manual_capped as (select id, subject_id from manual_ranked where rn <= v_total),
    filler as (
      select q.id, q.subject_id, row_number() over (order by random()) as rn
      from public.questions q
      where q.is_active and q.deleted_at is null
        and q.category = v_category
        and q.subject_id in (select subject_id from subjects_in_scope)
        and q.id not in (select id from manual_capped)
    ),
    filler_capped as (
      select id, subject_id from filler
      where rn <= (v_total - (select count(*) from manual_capped))
    ),
    combined as (
      select id, subject_id from manual_capped
      union all
      select id, subject_id from filler_capped
    )
    insert into public.attempt_questions (attempt_id, question_id, subject_id, position)
    select v_attempt, c.id, c.subject_id, row_number() over (order by random())
    from combined c;
  else
    with subjects_in_scope as (
      select s.id as subject_id, s."order" as sort_order
      from public.subjects s
      where v_subjects is null or cardinality(v_subjects) = 0 or s.id = any(v_subjects)
    ),
    manual as (
      select q.id, q.subject_id,
             row_number() over (partition by q.subject_id order by etq.created_at, q.id) as rn
      from public.exam_template_questions etq
      join public.questions q on q.id = etq.question_id
      where etq.template_id = p_template_id
        and q.is_active and q.deleted_at is null
        and q.subject_id in (select subject_id from subjects_in_scope)
    ),
    manual_capped as (select id, subject_id from manual where rn <= v_qps),
    manual_counts as (select subject_id, count(*) as cnt from manual_capped group by subject_id),
    filler as (
      select q.id, q.subject_id,
             row_number() over (partition by q.subject_id order by random()) as rn
      from public.questions q
      where q.is_active and q.deleted_at is null
        and q.category = v_category
        and q.subject_id in (select subject_id from subjects_in_scope)
        and q.id not in (select id from manual_capped)
    ),
    filler_capped as (
      select f.id, f.subject_id
      from filler f
      left join manual_counts mc on mc.subject_id = f.subject_id
      where f.rn <= (v_qps - coalesce(mc.cnt, 0))
    ),
    combined as (
      select id, subject_id from manual_capped
      union all
      select id, subject_id from filler_capped
    )
    insert into public.attempt_questions (attempt_id, question_id, subject_id, position)
    select v_attempt, c.id, c.subject_id,
           row_number() over (order by s."order", random())
    from combined c
    join public.subjects s on s.id = c.subject_id;
  end if;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'No active questions match this exam''s type and subjects yet. Add some in the Question Bank.';
  end if;

  return v_attempt;
end;
$$;

-- ── Resources library (Max Pro) ──────────────────────────────────────────────
create table if not exists public.resources (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  url         text not null,
  kind        text not null default 'book' check (kind in ('book','pdf','review')),
  sort_order  int not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.resources enable row level security;

-- Defence in depth: even the row data is only readable on Max Pro (or admin),
-- so a non-subscriber can't pull the links straight from the API.
drop policy if exists "resources read max pro" on public.resources;
create policy "resources read max pro" on public.resources
  for select using (
    public.is_admin()
    or public.plan_rank(public.effective_plan()) >= public.plan_rank('max_pro')
  );

drop policy if exists "resources admin write" on public.resources;
create policy "resources admin write" on public.resources
  for all using (public.is_admin()) with check (public.is_admin());
