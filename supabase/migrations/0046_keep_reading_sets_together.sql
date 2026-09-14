-- Keep reading-comprehension sets together, in their written order.
--
-- NMAT Verbal has passage-based sets: five questions share one "Selection",
-- and each question carries the whole passage in its stem followed by its own
-- numbered question ("16. The selection is best described as..."). start_attempt
-- dealt every question in random order, so a student got Selection 4, then an
-- analogy, then Selection 2, then Selection 4 again — rereading the same passage
-- in scattered places, with question 19 before question 16.
--
-- A set is now dealt as one block: the blocks and the standalone questions still
-- shuffle among themselves, but inside a block the questions come out 16, 17,
-- 18, 19, 20.
--
-- Grouping is derived from the stem rather than typed in, so CSV imports, the
-- create form and later edits all get it without anyone remembering to fill a
-- field. The key is a hash of the passage, not the selection number: "Selection
-- 1" in a future second mock would be a different passage and a different set.
--
-- Known limit: draws still pick individual questions. An exam that takes fewer
-- questions than the pool could deal two questions of a five-question set. Every
-- current Verbal template draws its whole pool, so that doesn't happen today.

alter table public.questions
  add column group_key   text,
  add column group_order int;

comment on column public.questions.group_key is
  'Questions sharing a key are dealt as one contiguous block. Derived from the stem by questions_derive_group; NULL for standalone questions.';
comment on column public.questions.group_order is
  'Position inside the block, taken from the question''s own number. NULL falls back to id order.';

-- "Selection 4\n\n<passage>\n\n16. <question>" -> hash of everything before the
-- final paragraph. Only stems that open with a Selection/Passage header count.
create or replace function public.question_group_key(p_stem text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_stem ~ E'^(Selection|Passage)\\s+[0-9]+\\s*\\n'
    then md5(regexp_replace(p_stem, E'\\n\\n[^\\n]*$', ''))
  end;
$$;

-- The leading number of the final paragraph: "16. The author..." -> 16.
create or replace function public.question_group_order(p_stem text)
returns int
language sql
immutable
set search_path to 'public'
as $$
  select substring(p_stem from E'\\n\\n\\s*([0-9]+)[.)][^\\n]*$')::int;
$$;

create or replace function public.questions_derive_group()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.group_key := public.question_group_key(new.stem);
  new.group_order := case
    when new.group_key is null then null
    else public.question_group_order(new.stem)
  end;
  return new;
end;
$$;

drop trigger if exists questions_derive_group on public.questions;
create trigger questions_derive_group
  before insert or update of stem on public.questions
  for each row execute function public.questions_derive_group();

-- Backfill by writing the columns directly rather than touching `stem`, so the
-- existing rows aren't rewritten.
update public.questions
set group_key   = public.question_group_key(stem),
    group_order = public.question_group_order(stem)
where public.question_group_key(stem) is not null;

create index if not exists questions_group_key_idx
  on public.questions (group_key)
  where group_key is not null;

-- ── start_attempt: deal sets as blocks ───────────────────────────────────────
-- Body as of 0040. Only the `units` CTE and the ORDER BY inside `shuffled`
-- change, in both branches. A standalone question is its own unit (keyed by its
-- id), so for any exam without sets the order is exactly as random as before.

create or replace function public.start_attempt(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
  v_owner     uuid;
  v_track     public.exam_track;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select questions_per_subject, total_questions, is_published, category, subject_ids, owner_id, track
    into v_qps, v_total, v_published, v_category, v_subjects, v_owner, v_track
  from public.exam_templates
  where id = p_template_id and deleted_at is null;

  if v_qps is null then
    raise exception 'Template not found';
  end if;

  if v_track <> public.my_track() and not public.is_admin() then
    raise exception 'That exam belongs to a different exam track.';
  end if;

  if v_owner is not null then
    if v_owner <> v_uid then
      raise exception 'Template not available';
    end if;
    if not public.is_admin()
       and public.plan_rank(public.effective_plan()) < public.plan_rank('pro') then
      raise exception 'Custom exams need a Pro plan. Upgrade to build your own.';
    end if;
  elsif not v_published and not public.is_admin() then
    raise exception 'Template not available';
  end if;

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
      where s.track = v_track
        and (v_subjects is null or cardinality(v_subjects) = 0 or s.id = any(v_subjects))
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
    ),
    -- One random draw per set (or per standalone question). Materialized so
    -- every member of a set sorts on the same number.
    units as materialized (
      select coalesce(q.group_key, q.id::text) as unit, random() as r
      from combined c
      join public.questions q on q.id = c.id
      group by coalesce(q.group_key, q.id::text)
    ),
    shuffled as materialized (
      select c.id as question_id, c.subject_id,
             public.shuffle_question_options(q.options, q.correct_label) as sh,
             row_number() over (order by u.r, q.group_order nulls first, q.id) as pos
      from combined c
      join public.questions q on q.id = c.id
      join units u on u.unit = coalesce(q.group_key, q.id::text)
    ),
    ins as (
      insert into public.attempt_questions (attempt_id, question_id, subject_id, position, options)
      select v_attempt, s.question_id, s.subject_id, s.pos, s.sh->'options'
      from shuffled s
      returning id, question_id
    )
    insert into public.attempt_question_keys (attempt_question_id, correct_label)
    select i.id, s.sh->>'correct_label'
    from ins i
    join shuffled s on s.question_id = i.question_id
    where s.sh->>'correct_label' is not null;
  else
    with subjects_in_scope as (
      select s.id as subject_id, s."order" as sort_order
      from public.subjects s
      where s.track = v_track
        and (v_subjects is null or cardinality(v_subjects) = 0 or s.id = any(v_subjects))
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
    ),
    units as materialized (
      select coalesce(q.group_key, q.id::text) as unit, random() as r
      from combined c
      join public.questions q on q.id = c.id
      group by coalesce(q.group_key, q.id::text)
    ),
    shuffled as materialized (
      select c.id as question_id, c.subject_id,
             public.shuffle_question_options(q.options, q.correct_label) as sh,
             row_number() over (order by s."order", u.r, q.group_order nulls first, q.id) as pos
      from combined c
      join public.questions q on q.id = c.id
      join public.subjects s on s.id = c.subject_id
      join units u on u.unit = coalesce(q.group_key, q.id::text)
    ),
    ins as (
      insert into public.attempt_questions (attempt_id, question_id, subject_id, position, options)
      select v_attempt, s.question_id, s.subject_id, s.pos, s.sh->'options'
      from shuffled s
      returning id, question_id
    )
    insert into public.attempt_question_keys (attempt_question_id, correct_label)
    select i.id, s.sh->>'correct_label'
    from ins i
    join shuffled s on s.question_id = i.question_id
    where s.sh->>'correct_label' is not null;
  end if;

  select count(*) into v_count
  from public.attempt_questions where attempt_id = v_attempt;

  if v_count = 0 then
    raise exception 'No active questions match this exam''s type and subjects yet. Add some in the Question Bank.';
  end if;

  return v_attempt;
end;
$fn$;
