-- Personal exam presets: named, reusable, student-authored practice exams.
--
-- Why: every exam is admin-authored, and some daily/weekly sets run to ~100
-- items. Students who can't commit to that were skipping practice entirely.
-- Pro and Max Pro students can now save their own short sets — they pick the
-- name, daily-vs-weekly, the item count, the subjects and an optional timer.
--
-- Modelled as exam_templates rows with a non-null owner_id, so the entire exam
-- engine (start_attempt, attempt_questions, submit_attempt, get_attempt_review,
-- discard_expired_attempt, the runner, results and analytics) works unchanged.
-- The alternative — a separate exam_presets table — would make
-- exam_attempts.template_id polymorphic, and that column is a hard FK with
-- ON DELETE RESTRICT, so every join site would have to be rewritten.
--
-- A preset is always is_published = false, which keeps it out of every student
-- catalog query (/exams, /dashboard and notifications.ts all filter on it), so
-- it is reachable only through the owner's own SELECT policy below.
--
-- Writes go through SECURITY DEFINER RPCs, not RLS insert/update policies: the
-- fields a student may control are a whitelist (title, category, size, subject
-- scope, time limit) and everything else — owner_id, is_published, mode, the
-- pass thresholds, the per-user cap, the plan gate — has to be pinned
-- server-side. One omission in a WITH CHECK predicate would be a privilege
-- escalation (category = 'mock_exam' mints free mock exams). Delete cannot be
-- a policy at all, because exam_attempts.template_id is ON DELETE RESTRICT and
-- a preset with history must be soft-deleted — same reasoning, and the same
-- shape, as admin_delete_template.
--
-- NOTE ON THE FUNCTION BODIES BELOW: migrations 0022, 0025, 0027 and 0032 were
-- committed as comment-only stubs, with the real bodies applied through the
-- Supabase API. The start_attempt and admin_category_performance definitions
-- here were recovered with pg_get_functiondef against the live project and
-- edited, so they are a faithful superset of production. They are committed in
-- full deliberately — do not go back to the stub pattern.

-- ── column, index, integrity backstop ───────────────────────────────────────

alter table public.exam_templates
  add column if not exists owner_id uuid references public.profiles (id) on delete cascade;

comment on column public.exam_templates.owner_id is
  'NULL = admin-authored global exam. Non-null = that student''s personal preset.';

create index if not exists exam_templates_owner_idx
  on public.exam_templates (owner_id, created_at desc)
  where owner_id is not null;

-- Backstop only; the RPCs below are the enforcement point. If a future change
-- ever adds an RLS insert policy, this still blocks the obvious escalations: a
-- preset that is published, that is a mock exam, or that has a rigged pass mark.
--
-- min_subject_score is pinned to 0 deliberately, and it is not a stylistic
-- choice. submit_attempt computes
--   passed := (avg(per-subject pct) >= pass_average
--              and min(per-subject pct) >= min_subject_score)
-- and the TOTAL branch of start_attempt draws globally at random with no
-- per-subject balancing. A 15-item preset spread over 12 subjects therefore
-- gives several subjects exactly one question, and a single wrong answer sets
-- that subject to 0% and fails the whole exam. Presets pass on the general
-- average alone. The student never sees this field.
--
-- The category literals below are compared against the exam_category enum; if
-- a later migration renames a value, this constraint has to be updated with it.
alter table public.exam_templates
  drop constraint if exists exam_templates_owner_shape_check;
alter table public.exam_templates
  add constraint exam_templates_owner_shape_check check (
    owner_id is null
    or (
      is_published = false
      and mode = 'mock'
      and category in ('daily_practice', 'weekly_practice')
      and total_questions is not null
      and total_questions between 5 and 100
      and pass_average = 75
      and min_subject_score = 0
      and (time_limit_minutes is null or time_limit_minutes between 1 and 300)
    )
  );

-- ── RLS: owners read their own presets. No owner write policies, by design. ──

drop policy if exists "templates read own presets" on public.exam_templates;
create policy "templates read own presets" on public.exam_templates
  for select using (owner_id is not null and owner_id = auth.uid());

-- ── my_question_coverage ────────────────────────────────────────────────────
-- The student-callable half of admin_question_coverage. The preset form has to
-- warn "only 34 daily-practice questions exist in the subjects you picked"
-- before the student saves a 60-item preset, but public.questions is admin-only
-- RLS and admin_question_coverage() raises 'Not authorized'. Without this a
-- student's form is completely blind.
--
-- Aggregate counts carry no question content, so they are safe to expose to any
-- signed-in user. Row shape matches admin_question_coverage minus the name
-- columns, so buildCoverage() in src/lib/exam-availability.ts consumes it as-is.
create or replace function public.my_question_coverage()
returns table (subject_id uuid, category public.exam_category, n bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  return query
  select s.id, c.category, count(q.id)
  from public.subjects s
  cross join (select unnest(enum_range(null::public.exam_category)) as category) c
  left join public.questions q
    on q.subject_id = s.id
   and q.category = c.category
   and q.is_active
   and q.deleted_at is null
  group by s.id, c.category, s."order"
  order by s."order", c.category;
end;
$$;

-- ── shared plan gate for create/update ──────────────────────────────────────
create or replace function public.assert_can_manage_presets()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  -- Admins are exempt so they can smoke-test the feature, matching the quota
  -- exemption already in start_attempt. Without this an admin whose own
  -- subscription row says 'free' cannot see the feature they are supporting.
  if public.is_admin() then
    return;
  end if;
  if public.plan_rank(public.effective_plan()) < public.plan_rank('pro') then
    raise exception 'Custom exams need a Pro plan. Upgrade to build your own.';
  end if;
end;
$$;

-- How many questions of this type actually exist in the chosen subjects.
-- Used to reject an oversized preset at save time rather than letting
-- start_attempt silently build a short exam: filler_capped just returns fewer
-- rows, and the 'No active questions' error only fires at exactly zero.
create or replace function public.preset_pool_size(
  p_category public.exam_category,
  p_subject_ids uuid[]
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.questions q
  where q.is_active
    and q.deleted_at is null
    and q.category = p_category
    and (p_subject_ids is null
         or cardinality(p_subject_ids) = 0
         or q.subject_id = any(p_subject_ids));
$$;

-- ── create_exam_preset ──────────────────────────────────────────────────────
create or replace function public.create_exam_preset(
  p_title              text,
  p_category           public.exam_category,
  p_total_questions    int,
  p_subject_ids        uuid[] default null,
  p_time_limit_minutes int    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_subs  uuid[];
  v_pool  int;
  v_count int;
  v_id    uuid;
begin
  perform public.assert_can_manage_presets();

  if v_title = '' then
    raise exception 'Give your exam a name.';
  end if;
  if length(v_title) > 80 then
    raise exception 'That name is too long (80 characters max).';
  end if;
  if p_category not in ('daily_practice', 'weekly_practice') then
    raise exception 'Custom exams can only be daily or weekly practice.';
  end if;
  if p_total_questions is null or p_total_questions < 5 or p_total_questions > 100 then
    raise exception 'Choose between 5 and 100 questions.';
  end if;
  if p_time_limit_minutes is not null
     and (p_time_limit_minutes < 1 or p_time_limit_minutes > 300) then
    raise exception 'Time limit must be between 1 and 300 minutes.';
  end if;

  -- Empty array == all subjects, same convention as start_attempt.
  v_subs := case when p_subject_ids is null or cardinality(p_subject_ids) = 0
                 then null else p_subject_ids end;

  -- Reject unknown subject ids rather than storing them: they would silently
  -- shrink the draw pool for the life of the preset.
  if v_subs is not null and exists (
    select 1 from unnest(v_subs) x(id)
    where not exists (select 1 from public.subjects s where s.id = x.id)
  ) then
    raise exception 'Unknown subject selected.';
  end if;

  select count(*) into v_count
  from public.exam_templates
  where owner_id = v_uid and deleted_at is null;
  if v_count >= 20 then
    raise exception 'You already have 20 saved exams. Delete one to make room.';
  end if;

  v_pool := public.preset_pool_size(p_category, v_subs);
  if v_pool = 0 then
    raise exception 'There are no questions of that type in the subjects you picked yet.';
  end if;
  if v_pool < p_total_questions then
    raise exception 'Only % question(s) available for that type and those subjects. Lower the number or add subjects.', v_pool;
  end if;

  -- questions_per_subject is set to 1 purely to satisfy the NOT NULL / > 0
  -- check inherited from 0001_init; the TOTAL branch of start_attempt never
  -- reads it, and the CHECK above guarantees total_questions is always set.
  insert into public.exam_templates (
    title, mode, category, questions_per_subject, total_questions,
    time_limit_minutes, pass_average, min_subject_score, subject_ids,
    is_published, created_by, owner_id
  ) values (
    v_title, 'mock', p_category, 1, p_total_questions,
    p_time_limit_minutes, 75, 0, v_subs,
    false, v_uid, v_uid
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ── update_exam_preset ──────────────────────────────────────────────────────
create or replace function public.update_exam_preset(
  p_id                 uuid,
  p_title              text,
  p_category           public.exam_category,
  p_total_questions    int,
  p_subject_ids        uuid[] default null,
  p_time_limit_minutes int    default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_subs  uuid[];
  v_pool  int;
begin
  perform public.assert_can_manage_presets();

  if not exists (
    select 1 from public.exam_templates
    where id = p_id and owner_id = v_uid and deleted_at is null
  ) then
    raise exception 'Exam not found.';
  end if;

  if v_title = '' then
    raise exception 'Give your exam a name.';
  end if;
  if length(v_title) > 80 then
    raise exception 'That name is too long (80 characters max).';
  end if;
  if p_category not in ('daily_practice', 'weekly_practice') then
    raise exception 'Custom exams can only be daily or weekly practice.';
  end if;
  if p_total_questions is null or p_total_questions < 5 or p_total_questions > 100 then
    raise exception 'Choose between 5 and 100 questions.';
  end if;
  if p_time_limit_minutes is not null
     and (p_time_limit_minutes < 1 or p_time_limit_minutes > 300) then
    raise exception 'Time limit must be between 1 and 300 minutes.';
  end if;

  v_subs := case when p_subject_ids is null or cardinality(p_subject_ids) = 0
                 then null else p_subject_ids end;

  if v_subs is not null and exists (
    select 1 from unnest(v_subs) x(id)
    where not exists (select 1 from public.subjects s where s.id = x.id)
  ) then
    raise exception 'Unknown subject selected.';
  end if;

  v_pool := public.preset_pool_size(p_category, v_subs);
  if v_pool = 0 then
    raise exception 'There are no questions of that type in the subjects you picked yet.';
  end if;
  if v_pool < p_total_questions then
    raise exception 'Only % question(s) available for that type and those subjects. Lower the number or add subjects.', v_pool;
  end if;

  update public.exam_templates
  set title              = v_title,
      category           = p_category,
      total_questions    = p_total_questions,
      subject_ids        = v_subs,
      time_limit_minutes = p_time_limit_minutes
  where id = p_id and owner_id = v_uid;
end;
$$;

-- ── delete_exam_preset ──────────────────────────────────────────────────────
-- Mirrors admin_delete_template. exam_attempts.template_id is ON DELETE
-- RESTRICT and the results page reads the exam title back through it, so a
-- preset with submitted history is archived rather than removed — otherwise the
-- student loses access to their own past scores. Unfinished attempts of a
-- preset that is going away are discarded (attempt_questions cascades), which
-- also refunds the practice quota, since the gate in start_attempt counts rows.
--
-- Deliberately NOT plan-gated: a student who has downgraded must still be able
-- to clean up presets they can no longer run.
create or replace function public.delete_exam_preset(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_in_progress int;
  v_remaining   int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.exam_templates
    where id = p_id and owner_id = v_uid and deleted_at is null
  ) then
    raise exception 'Exam not found.';
  end if;

  with gone as (
    delete from public.exam_attempts
    where template_id = p_id and user_id = v_uid and status = 'in_progress'
    returning 1
  )
  select count(*)::int into v_in_progress from gone;

  select count(*)::int into v_remaining
  from public.exam_attempts where template_id = p_id;

  if v_remaining > 0 then
    update public.exam_templates
      set deleted_at = coalesce(deleted_at, now())
    where id = p_id and owner_id = v_uid;
    return jsonb_build_object('ok', true, 'archived', true,
      'attempts_discarded', v_in_progress, 'results_kept', v_remaining);
  end if;

  delete from public.exam_templates where id = p_id and owner_id = v_uid;
  return jsonb_build_object('ok', true, 'archived', false,
    'attempts_discarded', v_in_progress, 'results_kept', 0);
end;
$$;

-- ── admin_category_performance: exclude student presets ─────────────────────
-- Full replacement of the live definition; the only change is the
-- "and t.owner_id is null" join condition.
--
-- Without it every preset attempt is folded into the admin's daily/weekly
-- attempt, student, average-score and pass-rate tiles. Presets are the main
-- thing Pro students will take once this ships, so the pollution would be
-- total, not marginal — it would wipe out the exact signal the page exists to
-- show, which is how the admin's OWN authored exams are performing.
create or replace function public.admin_category_performance()
returns table (
  category  public.exam_category,
  attempts  bigint,
  students  bigint,
  avg_score numeric,
  pass_rate numeric
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
  left join public.exam_templates t
    on t.category = c.category and t.owner_id is null
  left join public.exam_attempts a
    on a.template_id = t.id and a.status = 'submitted'
  group by c.category
  order by c.category;
end;
$$;

-- ── start_attempt: full replacement ─────────────────────────────────────────
-- Base is the live definition as of this migration (recovered via
-- pg_get_functiondef). Only three things are new, all marked NEW below:
-- reading owner_id, declaring v_owner, and the availability gate. The quota
-- block, both draw branches and the zero-row check are byte-for-byte the
-- deployed body.
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
  v_owner     uuid;   -- NEW
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- NEW: owner_id added to the select list.
  select questions_per_subject, total_questions, is_published, category, subject_ids, owner_id
    into v_qps, v_total, v_published, v_category, v_subjects, v_owner
  from public.exam_templates
  where id = p_template_id and deleted_at is null;

  if v_qps is null then
    raise exception 'Template not found';
  end if;

  -- NEW: personal presets. They are always is_published = false, so the
  -- original gate would have rejected every one of them, and only the owner may
  -- ever start one. The plan check is repeated here (assert_can_manage_presets
  -- covers create/update) so a student who built presets on Pro and then
  -- downgraded cannot keep running them.
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

  -- Quota check (admins exempt so they can always test).
  -- Presets are constrained to daily_practice/weekly_practice, so they always
  -- score as non-mock and consume the practice allowance, exactly like an
  -- admin-authored practice exam.
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
