-- Tag each question with the exam type it belongs to. Exam assembly then draws
-- only from questions whose category matches the exam template's category.

alter table public.questions
  add column category exam_category not null default 'mock_exam';

-- Spread existing demo questions across the three categories (per subject) so the
-- daily / weekly / mock demo exams all have questions to draw from.
with ranked as (
  select id, row_number() over (partition by subject_id order by created_at) as rn
  from public.questions
)
update public.questions q
  set category = (array['daily_practice','weekly_practice','mock_exam']::exam_category[])[((r.rn - 1) % 3) + 1]
from ranked r
where r.id = q.id;

create index questions_category_idx on public.questions (subject_id, category) where is_active;

-- ── start_attempt: draw only from questions matching the exam's category ───────
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
    where q.is_active and q.category = v_category
  ) picked
  where picked.rn <= v_qps;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'No active questions in this category yet. Tag some questions for it in the Question Bank.';
  end if;

  return v_attempt;
end;
$$;
