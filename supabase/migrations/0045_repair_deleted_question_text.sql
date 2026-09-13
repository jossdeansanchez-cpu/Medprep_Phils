-- Finish the U+FFFD repair for soft-deleted questions.
--
-- 0043 only touched live questions. Deleted ones never reach a new exam, but 23
-- of the 38 still carrying the replacement character were served before being
-- deleted, and a past attempt's review reads the stem and explanation from the
-- question row and the options from its own snapshot. So students reviewing an
-- old exam still saw "patient�s", "4-12 �m" and "5� to 3�".
--
-- Same context rules as 0043, plus three this set needs:
--   4-12 �m               → 4-12 µm
--   8.5�9.5 (no spaces)   → 8.5–9.5
--   5� to 3� (DNA strand) → 5′ to 3′, a prime rather than an apostrophe
--
-- 40 fields on deleted questions and 4 snapshot options; nothing without the
-- character changes, and no option becomes empty or duplicated. Originals go
-- into questions_textfix_backup alongside 0043's. Idempotent.

create or replace function public.repair_deleted_question_text(p_qid uuid, p_text text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $fn$
declare
  f constant text := chr(65533);
  t text := p_text;
begin
  if t is null or t !~ f then return t; end if;

  if p_qid = 'ec5abc1f-a536-4228-a7a8-b5b8635424bc' then
    t := regexp_replace(t, '([35])'||f, '\1′', 'g');
  end if;

  t := regexp_replace(t, '(\d)(\s?)'||f||'(m)\y', '\1\2µ\3', 'g');
  t := regexp_replace(t, '(\d)\s?'||f||'\s?([CF])\y', '\1°\2', 'g');
  t := regexp_replace(t, '(\d)'||f||'(\d)', '\1–\2', 'g');
  t := regexp_replace(t, '(\d)\s'||f||'\s(\d)', '\1–\2', 'g');
  t := regexp_replace(t, '([A-Za-z])'||f||'([sS])\y', '\1''\2', 'g');
  t := regexp_replace(t, '\s'||f||'\s', ' – ', 'g');
  t := regexp_replace(t, '(^|[\s(\[:;,])'||f||'([^\s'||f||'][^'||f||']{0,80}?)'||f||'(?=$|[\s.,;:!?)\]])', '\1''\2''', 'g');
  t := regexp_replace(t, '([A-Za-z.,;:!?])'||f||'(?=$|[\s.,;:!?)\]])', '\1''', 'g');
  t := regexp_replace(t, '(\s)'||f||'(?=[A-Z])', '\1– ', 'g');
  return t;
end;
$fn$;

insert into public.questions_textfix_backup (id, stem, options, explanation)
select q.id, q.stem, q.options, q.explanation
from public.questions q
where q.deleted_at is not null
  and (q.stem ~ chr(65533) or q.explanation ~ chr(65533) or q.options::text ~ chr(65533))
on conflict (id) do nothing;

update public.questions q
   set stem        = public.repair_deleted_question_text(q.id, q.stem),
       explanation = public.repair_deleted_question_text(q.id, q.explanation),
       options     = (
         select jsonb_agg(
                  case when e.val ? 'text'
                       then jsonb_set(e.val, '{text}', to_jsonb(public.repair_deleted_question_text(q.id, e.val->>'text')))
                       else e.val end
                  order by e.ord)
         from jsonb_array_elements(q.options) with ordinality e(val, ord)
       )
 where q.deleted_at is not null
   and (q.stem ~ chr(65533) or q.explanation ~ chr(65533) or q.options::text ~ chr(65533));

-- Snapshot text matches its question here, so the same function applies
-- directly. Only text changes; labels and order are untouched.
update public.attempt_questions aq
   set options = (
     select jsonb_agg(
              case when e.val ? 'text'
                   then jsonb_set(e.val, '{text}', to_jsonb(public.repair_deleted_question_text(aq.question_id, e.val->>'text')))
                   else e.val end
              order by e.ord)
     from jsonb_array_elements(aq.options) with ordinality e(val, ord)
   )
 where aq.options::text ~ chr(65533);

drop function public.repair_deleted_question_text(uuid, text);
