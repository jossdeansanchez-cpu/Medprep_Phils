-- Second exam track: NMAT alongside PLE.
--
-- Until now the whole app assumed one exam. The 12 PLE subjects were simply
-- "the subjects", and a plan was account-wide. This adds a track dimension so
-- NMAT can carry its own subjects, question bank, exams and plans.
--
-- Two design notes worth knowing before reading the rest:
--
--  1. Only `subjects` really needs the track. start_attempt() draws questions by
--     joining subjects, so a question inherits its track through subject_id and
--     the questions table is left alone — no backfill of the question bank.
--
--  2. A student holds ONE track at a time. Rather than threading a track
--     argument through every gate, effective_plan() reports 'free' whenever the
--     subscription's track differs from the profile's. start_attempt,
--     plan_exam_limit, the resources policy and assert_can_manage_presets all
--     call effective_plan(), so they become track-aware for free.
--
-- Every new column defaults to 'ple', which is what migrates the existing
-- subjects, students and paying customers across. There is no data migration.

create type public.exam_track as enum ('ple', 'nmat');

-- ── Track columns ────────────────────────────────────────────────────────────

alter table public.subjects
  add column track public.exam_track not null default 'ple';

alter table public.profiles
  add column track public.exam_track not null default 'ple';

-- Which track this payment bought. Compared against profiles.track below.
alter table public.subscriptions
  add column track public.exam_track not null default 'ple';

alter table public.exam_templates
  add column track public.exam_track not null default 'ple';

-- Null means the resource shows on every track (e.g. a general study-skills
-- guide); a value pins it to one.
alter table public.resources
  add column track public.exam_track;

-- Slugs only need to be unique within a track, so a future track can reuse
-- 'biology' or 'anatomy' without colliding.
alter table public.subjects drop constraint if exists subjects_slug_key;
alter table public.subjects add constraint subjects_track_slug_key unique (track, slug);

create index if not exists subjects_track_idx on public.subjects (track);
create index if not exists exam_templates_track_idx on public.exam_templates (track);

-- ── my_track() ───────────────────────────────────────────────────────────────
-- Mirrors is_admin(): security definer so it can be used inside RLS policies
-- without tripping recursion on profiles.

create or replace function public.my_track()
returns public.exam_track
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.track from public.profiles p where p.id = auth.uid()),
    'ple'::public.exam_track
  );
$$;

-- ── Entitlements become track-scoped ─────────────────────────────────────────
-- Same shape as 0020, plus `s.track = p.track`. The left joins and the coalesce
-- matter: a user with no profile or no subscription row must still resolve to
-- 'free' rather than null, or every plan_rank() comparison downstream goes null
-- and silently passes.

create or replace function public.effective_plan()
returns plan_tier language sql stable security definer set search_path = public as $$
  select coalesce(
    case
      when s.status in ('active','trialing')
       and (s.current_period_end is null or s.current_period_end > now())
       and s.track = coalesce(p.track, 'ple'::public.exam_track)
      then s.plan
    end,
    'free'::plan_tier
  )
  from (select auth.uid() as uid) me
  left join public.profiles p      on p.id = me.uid
  left join public.subscriptions s on s.user_id = me.uid;
$$;

create or replace function public.current_entitlements()
returns table (plan plan_tier, status text, entitled boolean, current_period_end timestamptz)
language sql stable security definer set search_path = public as $$
  with ent as (
    select s.plan as sub_plan, s.status as sub_status, s.current_period_end as sub_end,
           (s.status in ('active','trialing')
            and (s.current_period_end is null or s.current_period_end > now())
            and s.track = coalesce(p.track, 'ple'::public.exam_track)) as ok
    from (select auth.uid() as uid) me
    left join public.profiles p      on p.id = me.uid
    left join public.subscriptions s on s.user_id = me.uid
  )
  select
    case when coalesce(ent.ok, false) then coalesce(ent.sub_plan, 'free'::plan_tier)
         else 'free'::plan_tier end,
    coalesce(ent.sub_status, 'inactive'),
    coalesce(ent.ok, false),
    ent.sub_end
  from ent;
$$;

-- A subscription for the other track buys no billing window either, so such a
-- student falls back to the UTC calendar month like any free user.
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
       join public.profiles p on p.id = s.user_id
      where s.user_id = auth.uid()
        and s.status in ('active','trialing')
        and s.current_period_end > now()
        and s.track = p.track),
    date_trunc('month', now() at time zone 'utc')
  );
$$;

-- ── admin_set_plan: grant against a track ────────────────────────────────────
-- Defaults to the student's current track, which is almost always what an admin
-- comping a plan means. Granting for the track the student isn't on would look
-- like the grant silently failed.

create or replace function public.admin_set_plan(
  p_user_id  uuid,
  p_plan     public.plan_tier,
  p_ends_at  timestamptz default null,   -- null = no expiry
  p_interval public.billing_interval default 'year',
  p_track    public.exam_track default null  -- null = the student's own track
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_track public.exam_track;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  if p_plan <> 'free' and p_ends_at is not null and p_ends_at <= now() then
    raise exception 'That validity date is already in the past.';
  end if;

  select coalesce(p_track, p.track, 'ple'::public.exam_track)
    into v_track
  from public.profiles p
  where p.id = p_user_id;

  if v_track is null then
    raise exception 'Student not found';
  end if;

  insert into public.subscriptions (user_id, plan, status, interval, current_period_end, track, updated_at)
  values (
    p_user_id,
    p_plan,
    case when p_plan = 'free' then 'inactive' else 'active' end,
    p_interval,
    case when p_plan = 'free' then null else p_ends_at end,
    v_track,
    now()
  )
  on conflict (user_id) do update
    set plan               = excluded.plan,
        status             = excluded.status,
        interval           = excluded.interval,
        current_period_end = excluded.current_period_end,
        track              = excluded.track,
        updated_at         = now();
end;
$$;

revoke all on function public.admin_set_plan(uuid, public.plan_tier, timestamptz, public.billing_interval, public.exam_track) from public;
grant execute on function public.admin_set_plan(uuid, public.plan_tier, timestamptz, public.billing_interval, public.exam_track) to authenticated;

-- The 4-argument signature from 0033 would still resolve for existing callers
-- and write a 'ple' row by default. Drop it so a missed caller fails loudly
-- instead of quietly granting the wrong track.
drop function if exists public.admin_set_plan(uuid, public.plan_tier, timestamptz, public.billing_interval);

-- ── start_attempt: track guard + track-scoped subject pool ───────────────────
-- Body as of 0035, with two changes marked NEW.
--
-- The second one is the important one. `subject_ids` being null/empty means
-- "every subject", which after this migration would happily pull NMAT questions
-- into a PLE mock exam. Both branches of the draw need the track predicate.

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
  v_owner     uuid;
  v_track     public.exam_track;   -- NEW
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

  -- NEW: an exam belongs to one track. Admins bypass so they can test either
  -- track's content without switching their own profile over.
  if v_track <> public.my_track() and not public.is_admin() then
    raise exception 'That exam belongs to a different exam track.';
  end if;

  -- Personal presets are always is_published = false, so the original gate would
  -- have rejected every one of them, and only the owner may ever start one. The
  -- plan check is repeated here (assert_can_manage_presets covers create/update)
  -- so a student who built presets on Pro and then downgraded cannot keep
  -- running them.
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
      where s.track = v_track   -- NEW
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
    )
    insert into public.attempt_questions (attempt_id, question_id, subject_id, position)
    select v_attempt, c.id, c.subject_id, row_number() over (order by random())
    from combined c;
  else
    with subjects_in_scope as (
      select s.id as subject_id, s."order" as sort_order
      from public.subjects s
      where s.track = v_track   -- NEW
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

-- ── Personal presets stay inside the student's track ─────────────────────────
--
-- start_attempt already refuses to draw across tracks, so a preset could never
-- serve the wrong questions. The problem is upstream: preset_pool_size counted
-- every track's questions, so the Quiz Maker would happily accept a 60-question
-- preset backed by 20 real ones and only fail when the student pressed start.
-- Scoping the count to the caller's track is what makes the estimate honest.

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
  join public.subjects s on s.id = q.subject_id
  where q.is_active
    and q.deleted_at is null
    and q.category = p_category
    and s.track = public.my_track()
    and (p_subject_ids is null
         or cardinality(p_subject_ids) = 0
         or q.subject_id = any(p_subject_ids));
$$;

-- Same reasoning for the Quiz Maker's subject/coverage grid: it drove a picker
-- that would otherwise offer the other track's subjects.
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
  where s.track = public.my_track()
  group by s.id, c.category, s."order"
  order by s."order", c.category;
end;
$$;

-- Stamp new presets with the owner's track, and reject subjects from any other
-- one. Without the second check a student could hand-post another track's
-- subject ids and end up with a preset that can never draw a question.
create or replace function public.assert_preset_subjects_on_track(p_subject_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_subject_ids is null or cardinality(p_subject_ids) = 0 then
    return;
  end if;
  if exists (
    select 1 from unnest(p_subject_ids) x(id)
    where not exists (
      select 1 from public.subjects s
      where s.id = x.id and s.track = public.my_track()
    )
  ) then
    raise exception 'Unknown subject selected.';
  end if;
end;
$$;

-- Bodies as of 0035, with the subject check swapped for the track-aware one and
-- the new preset stamped with the owner's track.

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

  perform public.assert_preset_subjects_on_track(v_subs);

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

  insert into public.exam_templates (
    title, mode, category, track, questions_per_subject, total_questions,
    time_limit_minutes, pass_average, min_subject_score, subject_ids,
    is_published, created_by, owner_id
  ) values (
    v_title, 'mock', p_category, public.my_track(), 1, p_total_questions,
    p_time_limit_minutes, 75, 0, v_subs,
    false, v_uid, v_uid
  )
  returning id into v_id;

  return v_id;
end;
$$;

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

  -- Track added to the ownership check: a preset built before a track switch
  -- is not editable from the other track, where its subjects mean nothing.
  if not exists (
    select 1 from public.exam_templates
    where id = p_id and owner_id = v_uid and deleted_at is null
      and track = public.my_track()
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

  perform public.assert_preset_subjects_on_track(v_subs);

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

-- ── Resources follow the student's track ─────────────────────────────────────

drop policy if exists "resources read paid" on public.resources;
create policy "resources read paid" on public.resources
  for select using (
    public.is_admin()
    or (
      public.plan_rank(public.effective_plan()) >= public.plan_rank('basic')
      and (track is null or track = public.my_track())
    )
  );

-- ── Analytics show one track at a time ───────────────────────────────────────
-- A student who moves NMAT → PLE keeps both histories, but blending them into
-- one mastery table would compare unrelated subjects and read as noise.

create or replace function public.my_subject_mastery()
returns table (subject_name text, answered int, pct numeric)
language sql stable security definer set search_path = public as $$
  select s.name,
         count(*)::int,
         round(100.0 * sum(case when aq.is_correct then 1 else 0 end) / nullif(count(*), 0), 1)
  from public.attempt_questions aq
  join public.exam_attempts a on a.id = aq.attempt_id
  join public.subjects s on s.id = aq.subject_id
  where a.user_id = auth.uid()
    and a.status = 'submitted'
    and s.track = public.my_track()
  group by s.name
  order by 3 nulls last;
$$;

-- ── Signup carries the chosen track ──────────────────────────────────────────
-- Read off user_metadata so signup stays a single auth call; an unrecognised or
-- absent value falls back to PLE.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role  public.user_role;
  assigned_track public.exam_track;
begin
  if (select count(*) from public.profiles) = 0 then
    assigned_role := 'admin';
  else
    assigned_role := 'student';
  end if;

  begin
    assigned_track := (new.raw_user_meta_data ->> 'track')::public.exam_track;
  exception when others then
    assigned_track := 'ple';
  end;

  insert into public.profiles (id, full_name, role, track)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    assigned_role,
    coalesce(assigned_track, 'ple'::public.exam_track)
  );
  return new;
end;
$$;

-- ── NMAT subjects ────────────────────────────────────────────────────────────
-- Part I is Mental Ability, Part II is Academic Proficiency. Ordered so the two
-- parts stay grouped wherever subjects are listed by "order".

insert into public.subjects (name, slug, "order", track) values
  ('Verbal',              'verbal',              1, 'nmat'),
  ('Inductive Reasoning', 'inductive-reasoning', 2, 'nmat'),
  ('Quantitative',        'quantitative',        3, 'nmat'),
  ('Perceptual Acuity',   'perceptual-acuity',   4, 'nmat'),
  ('Biology',             'biology',             5, 'nmat'),
  ('Physics',             'physics',             6, 'nmat'),
  ('Social Science',      'social-science',      7, 'nmat'),
  ('Chemistry',           'chemistry',           8, 'nmat')
on conflict (track, slug) do nothing;
