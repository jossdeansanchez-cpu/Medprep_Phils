-- Defence in depth: the exam engine filtered only on is_active, so a question
-- whose is_active was flipped back on (without clearing deleted_at) would be
-- drawn into new exams. start_attempt now adds `and q.deleted_at is null` to all
-- four question-selecting CTEs (manual + filler, in both the TOTAL and the
-- PER-SUBJECT branch), and admin_question_coverage excludes deleted questions so
-- the exam-builder availability warnings only count usable ones.
--
-- Bodies recovered from the deployed migration history (version 20260725220406);
-- this file previously carried the comment above and no SQL at all.
--
-- Note this is start_attempt AS OF THIS MIGRATION. It is superseded later by
-- 0027 (plan quota gate) and 0035 (personal exam presets) — do not read it as
-- the current definition.

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
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select questions_per_subject, total_questions, is_published, category, subject_ids
    into v_qps, v_total, v_published, v_category, v_subjects
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

  if v_total is not null and v_total > 0 then
    -- TOTAL mode: draw v_total across scoped subjects, manual picks first.
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
        and q.is_active
        and q.deleted_at is null
        and q.subject_id in (select subject_id from subjects_in_scope)
    ),
    manual_capped as (
      select id, subject_id from manual_ranked where rn <= v_total
    ),
    filler as (
      select q.id, q.subject_id,
             row_number() over (order by random()) as rn
      from public.questions q
      where q.is_active
        and q.deleted_at is null
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
    -- PER-SUBJECT mode.
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
        and q.is_active
        and q.deleted_at is null
        and q.subject_id in (select subject_id from subjects_in_scope)
    ),
    manual_capped as (
      select id, subject_id from manual where rn <= v_qps
    ),
    manual_counts as (
      select subject_id, count(*) as cnt from manual_capped group by subject_id
    ),
    filler as (
      select q.id, q.subject_id,
             row_number() over (partition by q.subject_id order by random()) as rn
      from public.questions q
      where q.is_active
        and q.deleted_at is null
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

-- Availability warnings in the exam builder must not count deleted questions.
-- Signature must match the existing one exactly (sort_order, not subject_order).
create or replace function public.admin_question_coverage()
returns table (subject_id uuid, subject_name text, sort_order integer,
               category public.exam_category, n bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
  select s.id, s.name, s."order", c.category, count(q.id)
  from public.subjects s
  cross join (select unnest(enum_range(null::public.exam_category)) as category) c
  left join public.questions q
    on q.subject_id = s.id and q.category = c.category
       and q.is_active and q.deleted_at is null
  group by s.id, s.name, s."order", c.category
  order by s."order", c.category;
end;
$$;
