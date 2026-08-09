-- Free is now "1 exam per month" (start_attempt), not "10 answers per day".
-- The old daily cap would stop a free user part-way through the single exam
-- they're entitled to, so save_answer no longer touches practice_daily.
-- practice_daily itself is left in place (harmless historical data).
--
-- Body recovered from the deployed migration history (version 20260727211101);
-- this file previously carried the comment above and no SQL at all.

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
