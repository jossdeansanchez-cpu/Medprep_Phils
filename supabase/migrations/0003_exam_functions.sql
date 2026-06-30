-- Exam engine RPCs. All SECURITY DEFINER so they can read the answer-bearing
-- `questions` table on behalf of a student WITHOUT exposing correct answers,
-- while still scoping every operation to auth.uid().

-- ── start_attempt: assemble a randomized attempt from a template ──────────────
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
  v_count     int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select questions_per_subject, is_published
    into v_qps, v_published
  from public.exam_templates
  where id = p_template_id;

  if v_qps is null then
    raise exception 'Template not found';
  end if;
  if not v_published and not public.is_admin() then
    raise exception 'Template not available';
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

-- ── get_attempt_questions: answer-stripped questions for the runner ───────────
create or replace function public.get_attempt_questions(p_attempt_id uuid)
returns table (
  attempt_question_id uuid,
  question_id         uuid,
  subject_id          uuid,
  subject_name        text,
  item_no             int,
  stem                text,
  options             jsonb,
  selected_label      text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.exam_attempts a
    where a.id = p_attempt_id
      and (a.user_id = auth.uid() or public.is_admin())
  ) then
    raise exception 'Attempt not found';
  end if;

  return query
  select aq.id, aq.question_id, aq.subject_id, s.name, aq.position,
         q.stem, q.options, aq.selected_label
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  join public.subjects s on s.id = aq.subject_id
  where aq.attempt_id = p_attempt_id
  order by aq.position;
end;
$$;

-- ── save_answer: record a selection; reveal answer ONLY in practice mode ──────
create or replace function public.save_answer(
  p_attempt_question_id uuid,
  p_selected text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_mode    public.exam_mode;
  v_status  public.attempt_status;
  v_correct text;
  v_expl    text;
  v_is_correct boolean;
begin
  select t.mode, a.status, q.correct_label, q.explanation
    into v_mode, v_status, v_correct, v_expl
  from public.attempt_questions aq
  join public.exam_attempts a on a.id = aq.attempt_id
  join public.exam_templates t on t.id = a.template_id
  join public.questions q on q.id = aq.question_id
  where aq.id = p_attempt_question_id
    and a.user_id = v_uid;

  if v_status is null then
    raise exception 'Question not found';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'Attempt already submitted';
  end if;

  v_is_correct := (p_selected = v_correct);

  update public.attempt_questions
  set selected_label = p_selected,
      -- Persist correctness immediately only in practice mode; mock grading
      -- happens at submit so an in-flight value cannot leak the key.
      is_correct = case when v_mode = 'practice' then v_is_correct else is_correct end
  where id = p_attempt_question_id;

  if v_mode = 'practice' then
    return jsonb_build_object(
      'revealed', true,
      'is_correct', v_is_correct,
      'correct_label', v_correct,
      'explanation', v_expl
    );
  end if;

  return jsonb_build_object('revealed', false);
end;
$$;

-- ── submit_attempt: grade, compute PLE-style result, mark submitted ───────────
create or replace function public.submit_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_status  public.attempt_status;
  v_pass    numeric;
  v_minsub  numeric;
  v_avg     numeric;
  v_minscore numeric;
  v_passed  boolean;
begin
  select a.status, t.pass_average, t.min_subject_score
    into v_status, v_pass, v_minsub
  from public.exam_attempts a
  join public.exam_templates t on t.id = a.template_id
  where a.id = p_attempt_id and a.user_id = v_uid;

  if v_status is null then
    raise exception 'Attempt not found';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'Attempt already submitted';
  end if;

  -- Grade every served question against the answer key.
  update public.attempt_questions aq
  set is_correct = (aq.selected_label is not null and aq.selected_label = q.correct_label)
  from public.questions q
  where q.id = aq.question_id and aq.attempt_id = p_attempt_id;

  -- Per-subject percentages, then the general average and pass decision.
  with per_subject as (
    select subject_id,
           100.0 * sum(case when is_correct then 1 else 0 end) / count(*) as pct
    from public.attempt_questions
    where attempt_id = p_attempt_id
    group by subject_id
  )
  select avg(pct), min(pct) into v_avg, v_minscore from per_subject;

  v_passed := (v_avg >= v_pass and v_minscore >= v_minsub);

  update public.exam_attempts
  set status = 'submitted',
      submitted_at = now(),
      general_average = round(v_avg, 2),
      passed = v_passed
  where id = p_attempt_id;
end;
$$;

-- ── get_attempt_review: full answers + explanations, ONLY after submission ────
create or replace function public.get_attempt_review(p_attempt_id uuid)
returns table (
  item_no        int,
  subject_id     uuid,
  subject_name   text,
  stem           text,
  options        jsonb,
  selected_label text,
  correct_label  text,
  is_correct     boolean,
  explanation    text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.exam_attempts a
    where a.id = p_attempt_id
      and (a.user_id = auth.uid() or public.is_admin())
      and a.status = 'submitted'
  ) then
    raise exception 'Review not available';
  end if;

  return query
  select aq.position, aq.subject_id, s.name, q.stem, q.options,
         aq.selected_label, q.correct_label, aq.is_correct, q.explanation
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  join public.subjects s on s.id = aq.subject_id
  where aq.attempt_id = p_attempt_id
  order by aq.position;
end;
$$;
