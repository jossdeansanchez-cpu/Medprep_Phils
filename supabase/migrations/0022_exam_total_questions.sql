-- Let an admin size an exam by a TOTAL number of questions (across all its
-- subjects) instead of per-subject. When total_questions is set (> 0) it takes
-- precedence; otherwise the existing per-subject behavior is used, so all
-- existing exams keep working unchanged. start_attempt gains a TOTAL branch
-- that draws total_questions across scoped subjects (manual picks first, then
-- random fill). See the applied migration in Supabase for the full function.
alter table public.exam_templates
  add column if not exists total_questions int;
