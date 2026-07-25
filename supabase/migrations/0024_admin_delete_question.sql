-- Deleting a question must also pull it out of exams that are already underway.
-- attempt_questions is a snapshot written at start_attempt time, so without this
-- a student resuming an in-progress exam still sees the deleted question.
-- Submitted attempts are left untouched so historical results stay intact.
-- (Full function body applied via Supabase; see admin_delete_question in the DB.)
create or replace function public.admin_delete_question(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used_submitted int;
  v_affected uuid[];
  v_emptied int := 0;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(distinct a.id), '{}') into v_affected
  from public.attempt_questions aq
  join public.exam_attempts a on a.id = aq.attempt_id
  where aq.question_id = p_id and a.status = 'in_progress';

  delete from public.attempt_questions aq
  using public.exam_attempts a
  where aq.attempt_id = a.id and aq.question_id = p_id and a.status = 'in_progress';

  with ranked as (
    select aq.id, row_number() over (partition by aq.attempt_id order by aq.position) as rn
    from public.attempt_questions aq
    where aq.attempt_id = any(v_affected)
  )
  update public.attempt_questions aq
  set position = ranked.rn
  from ranked
  where ranked.id = aq.id and aq.position is distinct from ranked.rn;

  with empties as (
    select a.id from public.exam_attempts a
    where a.id = any(v_affected)
      and not exists (select 1 from public.attempt_questions aq where aq.attempt_id = a.id)
  ), del as (
    delete from public.exam_attempts a using empties e where a.id = e.id returning 1
  )
  select count(*) into v_emptied from del;

  select count(*) into v_used_submitted
  from public.attempt_questions aq where aq.question_id = p_id;

  if v_used_submitted > 0 then
    update public.questions
      set is_active = false, deleted_at = coalesce(deleted_at, now())
    where id = p_id;
    return jsonb_build_object('ok', true, 'archived', true,
      'attempts_updated', coalesce(array_length(v_affected, 1), 0), 'attempts_removed', v_emptied);
  end if;

  delete from public.questions where id = p_id;
  return jsonb_build_object('ok', true, 'archived', false,
    'attempts_updated', coalesce(array_length(v_affected, 1), 0), 'attempts_removed', v_emptied);
end;
$$;
