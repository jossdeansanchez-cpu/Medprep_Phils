-- Let an exam target specific subjects. NULL / empty = all subjects.
alter table public.exam_templates add column subject_ids uuid[];

-- ── start_attempt: also restrict to the exam's chosen subjects (if any) ────────
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
  v_subjects  uuid[];
  v_count     int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select questions_per_subject, is_published, category, subject_ids
    into v_qps, v_published, v_category, v_subjects
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
      and q.category = v_category
      and (v_subjects is null or cardinality(v_subjects) = 0 or q.subject_id = any(v_subjects))
  ) picked
  where picked.rn <= v_qps;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'No active questions match this exam''s type and subjects yet. Add some in the Question Bank.';
  end if;

  return v_attempt;
end;
$$;
