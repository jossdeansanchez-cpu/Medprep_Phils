-- Flag questions that give the answer away by length.
--
-- After the bracket cleanup (0042) the correct option is still the longest in
-- 40% of questions, where chance is about 25%. In 1,027 active questions it is
-- at least 1.5x the longest wrong choice and 15+ characters longer, which is
-- enough to pick it without reading the stem.
--
-- No text rule fixes that. The wrong choices need rewriting, and a rewritten
-- wrong choice that turns out to be right teaches the wrong medicine, so that
-- is a job for someone who knows the content. This makes the problem visible
-- and keeps it visible: two generated columns the database recomputes on every
-- insert and edit, whether it came from CSV, the form or anywhere else. The
-- Question Bank filters and sorts on them.
--
-- Thresholds are mirrored in src/lib/answer-length.ts for the upload preview and
-- the question form; change both together. Replacing either function does not
-- recompute stored rows, so touch the table afterwards if you do.

create or replace function public.correct_answer_length_ratio(p_options jsonb, p_correct text)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
           when c.len is null or c.len = 0 or d.len is null or d.len = 0 then null
           else round(c.len::numeric / d.len, 2)
         end
  from (select max(length(e->>'text')) as len
          from jsonb_array_elements(p_options) e
         where e->>'label' = p_correct) c,
       (select max(length(e->>'text')) as len
          from jsonb_array_elements(p_options) e
         where e->>'label' is distinct from p_correct) d;
$$;

create or replace function public.has_long_correct_answer(p_options jsonb, p_correct text)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(c.len >= 1.5 * d.len and c.len - d.len >= 15, false)
  from (select max(length(e->>'text')) as len
          from jsonb_array_elements(p_options) e
         where e->>'label' = p_correct) c,
       (select max(length(e->>'text')) as len
          from jsonb_array_elements(p_options) e
         where e->>'label' is distinct from p_correct) d;
$$;

alter table public.questions
  add column if not exists correct_answer_length_ratio numeric
    generated always as (public.correct_answer_length_ratio(options, correct_label)) stored,
  add column if not exists has_long_correct_answer boolean
    generated always as (public.has_long_correct_answer(options, correct_label)) stored;

create index if not exists questions_long_correct_answer_idx
  on public.questions (correct_answer_length_ratio desc)
  where has_long_correct_answer and deleted_at is null;
