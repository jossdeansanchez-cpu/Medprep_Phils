-- Exam categories: daily practice, weekly practice, mock exam.
-- All three are timed, scored exams (mock engine). Category is used for grouping
-- and the admin performance report. Only the mock_exam category is Pro-gated.

create type exam_category as enum ('daily_practice', 'weekly_practice', 'mock_exam');

alter table public.exam_templates
  add column category exam_category not null default 'mock_exam';

-- Backfill from the legacy mode.
update public.exam_templates
  set category = (case when mode = 'mock' then 'mock_exam' else 'daily_practice' end)::exam_category;

-- ── start_attempt: gate by category (mock_exam requires Pro) ───────────────────
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
  v_published boolean;
  v_category  public.exam_category;
  v_count     int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select questions_per_subject, is_published, category
    into v_qps, v_published, v_category
  from public.exam_templates
  where id = p_template_id;

  if v_qps is null then
    raise exception 'Template not found';
  end if;
  if not v_published and not public.is_admin() then
    raise exception 'Template not available';
  end if;

  if v_category = 'mock_exam'
     and public.plan_rank(public.effective_plan()) < public.plan_rank('pro') then
    raise exception 'Upgrade to Pro to take mock exams';
  end if;

  insert into public.exam_attempts (user_id, template_id)
  values (v_uid, p_template_id)
  returning id into v_attempt;

  insert into public.attempt_questions (attempt_id, question_id, subject_id, position)
  select v_attempt, picked.id, picked.subject_id,
         row_number() over (order by picked.sort_order, random())
  from (
    select q.id, q.subject_id, s."order" as sort_order,
           row_number() over (partition by q.subject_id order by random()) as rn
    from public.questions q
    join public.subjects s on s.id = q.subject_id
    where q.is_active
  ) picked
  where picked.rn <= v_qps;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'No active questions available to build an exam';
  end if;

  return v_attempt;
end;
$$;

-- ── admin_category_performance: per-category summary (admin only) ──────────────
create or replace function public.admin_category_performance()
returns table (
  category   exam_category,
  attempts   bigint,
  students   bigint,
  avg_score  numeric,
  pass_rate  numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
  select c.category,
         count(a.id),
         count(distinct a.user_id),
         round(avg(a.general_average), 1),
         round(
           100.0 * count(a.id) filter (where a.passed)
           / nullif(count(a.id), 0), 0
         )
  from (select unnest(enum_range(null::exam_category)) as category) c
  left join public.exam_templates t on t.category = c.category
  left join public.exam_attempts a
    on a.template_id = t.id and a.status = 'submitted'
  group by c.category
  order by c.category;
end;
$$;
