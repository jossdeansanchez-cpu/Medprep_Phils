-- Randomise answer positions per attempt.
--
-- The bank has a heavy positional bias: 57% of stored answer keys are "B" and
-- 84% are A or B, so a student who always picks B scores about half a mock exam
-- without reading anything. Shuffling the bank once would only move the bias
-- around and would silently rewrite the answers of every exam already sat, since
-- review reads the live question row.
--
-- So the order becomes a property of the attempt, not of the question. Each
-- attempt stores the option array exactly as that student saw it, and the answer
-- key for that ordering. Two students sitting the same exam get different
-- orders, imports never reintroduce the bias, and an attempt is immune to later
-- edits of the question it came from.

-- ---------------------------------------------------------------------------
-- Which questions must keep their original order
-- ---------------------------------------------------------------------------

-- "All of the above" only means anything last, and "Both A and C" names other
-- options by label — move either one and the item becomes unanswerable. About
-- 100 of 5,400 questions are like this; they keep the order they were written
-- in. The pattern is deliberately loose: a false positive costs nothing but a
-- question that stays unshuffled, a false negative corrupts the item.
create or replace function public.option_order_is_fixed(p_options jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(
    exists (
      select 1
      from jsonb_array_elements(p_options) e
      where lower(e->>'text') ~ '(all of the above|none of the above|all of these|none of these|both of the above|any of the above|a\.o\.t\.a|n\.o\.t\.a|\yaota\y|\ynota\y|\yboth [a-e] and [a-e]\y|\y[a-e] and [a-e] only\y|\y[a-e] & [a-e]\y)'
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- The shuffle
-- ---------------------------------------------------------------------------

-- Returns {"options": [...], "correct_label": "..."} — the options reordered
-- with their labels reassigned in place (so the student still sees A, B, C, D)
-- and the label that now holds the right answer.
--
-- Every guard below returns the input untouched rather than raising: a single
-- malformed question must never stop an exam from starting.
create or replace function public.shuffle_question_options(p_options jsonb, p_correct text)
returns jsonb
language plpgsql
volatile
set search_path to 'public'
as $$
declare
  v_labels  text[];
  v_n       int;
  v_options jsonb;
  v_correct text;
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    return jsonb_build_object('options', p_options, 'correct_label', p_correct);
  end if;

  v_n := jsonb_array_length(p_options);
  if v_n < 2 or p_correct is null or public.option_order_is_fixed(p_options) then
    return jsonb_build_object('options', p_options, 'correct_label', p_correct);
  end if;

  -- Reuse the question's own labels, so a 4-option item still reads A-D. Sorted
  -- so position 1 gets the first label rather than whichever came back first.
  select array_agg(lbl order by lbl)
    into v_labels
  from (select distinct e->>'label' as lbl from jsonb_array_elements(p_options) e) d;

  -- Duplicate, missing or absent labels, or a key pointing at no option: leave
  -- it alone. Relabelling would lose the answer.
  if v_labels is null
     or coalesce(array_length(v_labels, 1), 0) <> v_n
     or array_position(v_labels, null::text) is not null
     or not (p_correct = any(v_labels))
  then
    return jsonb_build_object('options', p_options, 'correct_label', p_correct);
  end if;

  with shuffled as (
    select e.value as opt, row_number() over (order by random()) as pos
    from jsonb_array_elements(p_options) e
  ),
  relabelled as (
    select (s.opt - 'label') || jsonb_build_object('label', v_labels[s.pos]) as opt,
           v_labels[s.pos] as new_label,
           s.opt->>'label'  as old_label,
           s.pos
    from shuffled s
  )
  select jsonb_agg(r.opt order by r.pos),
         max(r.new_label) filter (where r.old_label = p_correct)
    into v_options, v_correct
  from relabelled r;

  return jsonb_build_object('options', v_options, 'correct_label', v_correct);
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-attempt storage
-- ---------------------------------------------------------------------------

-- What the student saw. Safe to expose: it is already on their screen.
alter table public.attempt_questions
  add column if not exists options jsonb;

-- The answer key for that ordering, kept in its own table because students can
-- select (and update) their own attempt_questions rows. A correct_label column
-- there would hand out the key mid-exam in one PostgREST call, and Postgres
-- cannot revoke a single column while a table-level grant stands.
--
-- RLS is on with no policy, so nothing reaches a client. Every reader below is
-- SECURITY DEFINER and bypasses RLS.
create table if not exists public.attempt_question_keys (
  attempt_question_id uuid primary key
    references public.attempt_questions(id) on delete cascade,
  correct_label text not null
);

alter table public.attempt_question_keys enable row level security;
revoke all on public.attempt_question_keys from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Existing attempts copy the question verbatim, in its current order. Nothing
-- a student has already sat changes: 350 submitted attempts review exactly as
-- before, and the 168 in progress keep the options already on screen.
update public.attempt_questions aq
   set options = q.options
  from public.questions q
 where q.id = aq.question_id
   and aq.options is null;

insert into public.attempt_question_keys (attempt_question_id, correct_label)
select aq.id, q.correct_label
from public.attempt_questions aq
join public.questions q on q.id = aq.question_id
where q.correct_label is not null
on conflict (attempt_question_id) do nothing;

-- ---------------------------------------------------------------------------
-- Readers and writers
-- ---------------------------------------------------------------------------

-- Every read below falls back to the live question when the snapshot is missing,
-- so a row created by some path this migration did not anticipate still works.

create or replace function public.get_attempt_questions(p_attempt_id uuid)
returns table(attempt_question_id uuid, question_id uuid, subject_id uuid, subject_name text,
              item_no integer, stem text, stem_image_path text, options jsonb,
              selected_label text, revealed boolean)
language plpgsql
security definer
set search_path to 'public'
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
         q.stem, q.stem_image_path, coalesce(aq.options, q.options), aq.selected_label,
         (aq.revealed_at is not null)
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  join public.subjects s on s.id = aq.subject_id
  where aq.attempt_id = p_attempt_id
  order by aq.position;
end;
$$;

create or replace function public.get_attempt_review(p_attempt_id uuid)
returns table(item_no integer, subject_id uuid, subject_name text, stem text,
              stem_image_path text, options jsonb, selected_label text,
              correct_label text, is_correct boolean, explanation text)
language plpgsql
security definer
set search_path to 'public'
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
  select aq.position, aq.subject_id, s.name, q.stem, q.stem_image_path,
         coalesce(aq.options, q.options),
         aq.selected_label,
         coalesce(k.correct_label, q.correct_label),
         aq.is_correct, q.explanation
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  join public.subjects s on s.id = aq.subject_id
  left join public.attempt_question_keys k on k.attempt_question_id = aq.id
  where aq.attempt_id = p_attempt_id
  order by aq.position;
end;
$$;

create or replace function public.reveal_answer(p_attempt_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_status   public.attempt_status;
  v_category public.exam_category;
  v_selected text;
  v_correct  text;
  v_expl     text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select a.status, t.category, aq.selected_label,
         coalesce(k.correct_label, q.correct_label), q.explanation
    into v_status, v_category, v_selected, v_correct, v_expl
  from public.attempt_questions aq
  join public.exam_attempts a on a.id = aq.attempt_id
  join public.exam_templates t on t.id = a.template_id
  join public.questions q on q.id = aq.question_id
  left join public.attempt_question_keys k on k.attempt_question_id = aq.id
  where aq.id = p_attempt_question_id
    and a.user_id = v_uid;

  if v_status is null then
    raise exception 'Question not found';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'Attempt already submitted';
  end if;

  -- The whole point of a mock exam is that it behaves like the real one.
  if v_category = 'mock_exam' then
    raise exception 'Answers stay hidden in a mock exam until you submit it.';
  end if;

  -- Only after committing to an answer, or the score would be meaningless.
  if v_selected is null then
    raise exception 'Pick an answer first, then you can see the rationale.';
  end if;

  -- Idempotent: re-revealing after a page reload must not move the timestamp.
  update public.attempt_questions
     set revealed_at = coalesce(revealed_at, now())
   where id = p_attempt_question_id;

  return jsonb_build_object(
    'revealed', true,
    'is_correct', (v_selected = v_correct),
    'correct_label', v_correct,
    'explanation', v_expl
  );
end;
$$;

create or replace function public.submit_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_status   public.attempt_status;
  v_pass     numeric;
  v_minsub   numeric;
  v_avg      numeric;
  v_minscore numeric;
  v_passed   boolean;
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

  -- Graded against the key for this attempt's ordering, not the bank's.
  -- Scalar subqueries rather than a join, so an item with no snapshot still
  -- grades off the live question instead of dropping out of the update.
  update public.attempt_questions aq
  set is_correct = (
    aq.selected_label is not null
    and aq.selected_label = coalesce(
      (select k.correct_label from public.attempt_question_keys k
        where k.attempt_question_id = aq.id),
      (select q.correct_label from public.questions q where q.id = aq.question_id)
    )
  )
  where aq.attempt_id = p_attempt_id;

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

-- start_attempt is unchanged except for the two inserts at the bottom: each now
-- shuffles the question's options and records that ordering plus its key.
create or replace function public.start_attempt(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
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
    -- MATERIALIZED is load-bearing, not decoration: this CTE is read twice and
    -- a second evaluation would deal a different order than the key it stores.
    shuffled as materialized (
      select c.id as question_id, c.subject_id,
             public.shuffle_question_options(q.options, q.correct_label) as sh,
             row_number() over (order by random()) as pos
      from combined c
      join public.questions q on q.id = c.id
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
    shuffled as materialized (
      select c.id as question_id, c.subject_id,
             public.shuffle_question_options(q.options, q.correct_label) as sh,
             row_number() over (order by s."order", random()) as pos
      from combined c
      join public.questions q on q.id = c.id
      join public.subjects s on s.id = c.subject_id
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

  -- Counted rather than read from row_count: the outermost statement above is
  -- the key insert, which can legitimately cover fewer rows than it drew.
  select count(*) into v_count
  from public.attempt_questions where attempt_id = v_attempt;

  if v_count = 0 then
    raise exception 'No active questions match this exam''s type and subjects yet. Add some in the Question Bank.';
  end if;

  return v_attempt;
end;
$$;
