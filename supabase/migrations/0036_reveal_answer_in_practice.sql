-- "Show answer": let a student reveal the correct option and its rationale
-- mid-exam, on demand, for daily and weekly practice only.
--
-- Mock exams are excluded deliberately — they simulate the real PLE, so nothing
-- is revealed until submission. That gate is enforced here, in the database,
-- not in the runner: if the check lived only in the UI, a mock-exam student
-- could read every answer straight out of the network response.
--
-- Why category and not exam_templates.mode: every template ever created has
-- mode = 'mock' (admin/actions.ts hardcodes it — "every category is a timed,
-- scored exam"), so the mode = 'practice' branch that used to live in
-- save_answer has never once executed in production. category is the field that
-- actually distinguishes these exams, so it is what the gate reads.
--
-- Revealing LOCKS the answer. Without that, a student could answer, reveal,
-- then correct themselves and score 100% on an exam that is still graded
-- against pass_average — the score would mean nothing. The lock is a
-- revealed_at stamp checked inside save_answer, so it holds even if someone
-- calls the RPC directly rather than going through the UI.

alter table public.attempt_questions
  add column if not exists revealed_at timestamptz;

comment on column public.attempt_questions.revealed_at is
  'When the student used "Show answer" on this item. Non-null locks the answer.';

-- ── reveal_answer ───────────────────────────────────────────────────────────
create or replace function public.reveal_answer(p_attempt_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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

  select a.status, t.category, aq.selected_label, q.correct_label, q.explanation
    into v_status, v_category, v_selected, v_correct, v_expl
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
$fn$;

-- ── save_answer: refuse to change a revealed answer ─────────────────────────
-- Full replacement of the live definition (recovered via pg_get_functiondef).
-- Two changes: the revealed_at guard, and the removal of the dead
-- mode = 'practice' auto-reveal branch — reveal is now the explicit,
-- button-driven path above, and two ways to reveal is one too many.
create or replace function public.save_answer(
  p_attempt_question_id uuid,
  p_selected text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid      uuid := auth.uid();
  v_status   public.attempt_status;
  v_revealed timestamptz;
begin
  select a.status, aq.revealed_at
    into v_status, v_revealed
  from public.attempt_questions aq
  join public.exam_attempts a on a.id = aq.attempt_id
  where aq.id = p_attempt_question_id
    and a.user_id = v_uid;

  if v_status is null then
    raise exception 'Question not found';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'Attempt already submitted';
  end if;
  if v_revealed is not null then
    raise exception 'You already saw the answer for this question, so it is locked.';
  end if;

  update public.attempt_questions
  set selected_label = p_selected
  where id = p_attempt_question_id;

  -- is_correct is deliberately not set here; submit_attempt grades every item
  -- in one pass, and that has always been the single source of truth.
  return jsonb_build_object('revealed', false);
end;
$fn$;

-- ── get_attempt_questions: report which items are already revealed ──────────
-- So a student resuming an exam sees their revealed items still locked, rather
-- than being allowed to click an option and getting a raw error back from the
-- save_answer guard. Return type changes, so this is a drop + create.
drop function if exists public.get_attempt_questions(uuid);
create function public.get_attempt_questions(p_attempt_id uuid)
returns table (
  attempt_question_id uuid,
  question_id         uuid,
  subject_id          uuid,
  subject_name        text,
  item_no             integer,
  stem                text,
  options             jsonb,
  selected_label      text,
  revealed            boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
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
         q.stem, q.options, aq.selected_label, (aq.revealed_at is not null)
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  join public.subjects s on s.id = aq.subject_id
  where aq.attempt_id = p_attempt_id
  order by aq.position;
end;
$fn$;
