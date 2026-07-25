-- Deleting an exam failed with a raw FK error whenever anyone had taken it:
-- exam_attempts.template_id is ON DELETE RESTRICT, and results pages join back
-- to the template for its title, so the row can't just be removed.
-- Mirror the questions fix: soft-delete when history exists, hard-delete when not.
alter table public.exam_templates
  add column if not exists deleted_at timestamptz;

create or replace function public.admin_delete_template(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in_progress int;
  v_submitted   int;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  -- An exam that no longer exists can't be continued: discard its unfinished
  -- attempts (attempt_questions cascade off exam_attempts).
  with gone as (
    delete from public.exam_attempts
    where template_id = p_id and status = 'in_progress'
    returning 1
  )
  select count(*) into v_in_progress from gone;

  -- Submitted attempts are history — keep them, and keep the template row they
  -- read their title from, just marked deleted so it disappears from the app.
  select count(*) into v_submitted
  from public.exam_attempts where template_id = p_id;

  if v_submitted > 0 then
    update public.exam_templates
      set is_published = false, deleted_at = coalesce(deleted_at, now())
    where id = p_id;
    return jsonb_build_object('ok', true, 'archived', true,
      'attempts_discarded', v_in_progress, 'results_kept', v_submitted);
  end if;

  delete from public.exam_templates where id = p_id;
  return jsonb_build_object('ok', true, 'archived', false,
    'attempts_discarded', v_in_progress, 'results_kept', 0);
end;
$$;
