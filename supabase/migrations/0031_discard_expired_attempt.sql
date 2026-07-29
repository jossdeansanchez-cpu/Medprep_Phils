-- Timed mock exams use a wall-clock deadline (started_at + time_limit_minutes),
-- so the clock keeps running while a student is away. A student who opened an
-- exam and was interrupted came back to a dead end: the runner auto-submitted a
-- 0%, and because the quota check in start_attempt counts every attempt started
-- in the period regardless of status, that lost sitting had already eaten one of
-- their 2 (Basic) or 10 (Pro) mock exams — and retaking would eat another.
--
-- This lets an *untouched* expired attempt be thrown away so the student can
-- start over cleanly. Deleting the row is what frees the quota, since the quota
-- query counts rows. An attempt with any answer recorded is a real sitting and
-- is deliberately NOT discardable: it gets graded like any other exam.

create or replace function public.discard_expired_attempt(p_attempt_id uuid)
returns uuid -- the template id, so the caller can immediately start a fresh attempt
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_template uuid;
  v_started  timestamptz;
  v_limit    int;
  v_mode     public.exam_mode;
  v_answered int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Owner-scoped: a student may only discard their own unfinished attempt.
  select a.template_id, a.started_at, t.time_limit_minutes, t.mode
    into v_template, v_started, v_limit, v_mode
  from public.exam_attempts a
  join public.exam_templates t on t.id = a.template_id
  where a.id = p_attempt_id
    and a.user_id = v_uid
    and a.status = 'in_progress';

  if v_template is null then
    raise exception 'Attempt not found or already submitted';
  end if;

  if v_mode <> 'mock' or v_limit is null then
    raise exception 'This exam is not timed';
  end if;

  -- Re-check expiry server-side. The client clock is not trusted here: without
  -- this a student could discard a running exam they disliked and retake free.
  if now() < v_started + make_interval(mins => v_limit) then
    raise exception 'This exam has not expired yet';
  end if;

  select count(*) into v_answered
  from public.attempt_questions
  where attempt_id = p_attempt_id
    and selected_label is not null;

  if v_answered > 0 then
    raise exception 'This attempt has answers and must be submitted, not discarded';
  end if;

  -- attempt_questions cascades on delete.
  delete from public.exam_attempts where id = p_attempt_id;

  return v_template;
end;
$$;

revoke all on function public.discard_expired_attempt(uuid) from public;
grant execute on function public.discard_expired_attempt(uuid) to authenticated;
