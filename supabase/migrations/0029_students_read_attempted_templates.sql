-- Deleting/unpublishing an exam sets is_published = false, which hid the row
-- from the "templates read published" policy. Students who had already submitted
-- that exam then got NULL for exam_templates on the results page, crashing it —
-- they lost access to their own score, wrong answers and rationale.
--
-- A student must always be able to read the template of an exam they actually
-- took. App queries still filter on is_published/deleted_at, so deleted exams
-- do not reappear in the bookable list.
drop policy if exists "templates read own attempts" on public.exam_templates;
create policy "templates read own attempts" on public.exam_templates
  for select using (
    exists (
      select 1 from public.exam_attempts a
      where a.template_id = exam_templates.id
        and a.user_id = auth.uid()
    )
  );
