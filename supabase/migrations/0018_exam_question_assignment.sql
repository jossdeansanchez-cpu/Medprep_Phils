-- Let an admin manually pin a question into a specific exam template, up to
-- that template's per-subject question limit. Previously exam content was
-- assembled entirely by random draw at attempt-start; this adds an optional,
-- explicit assignment layer on top without breaking existing exams (a
-- template with zero manual assignments behaves exactly as before).

create table public.exam_template_questions (
  template_id uuid not null references public.exam_templates (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  subject_id  uuid not null references public.subjects (id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (template_id, question_id)
);
create index exam_template_questions_template_subject_idx
  on public.exam_template_questions (template_id, subject_id);

alter table public.exam_template_questions enable row level security;
create policy "exam_template_questions admin all" on public.exam_template_questions
  for all using (public.is_admin()) with check (public.is_admin());

-- ── start_attempt: prefer manually-assigned questions per subject, then fill
-- any remaining slots (up to questions_per_subject) with a random draw from
-- the matching pool, excluding questions already picked for that subject. ──
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

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'No active questions match this exam''s type and subjects yet. Add some in the Question Bank.';
  end if;

  return v_attempt;
end;
$$;
