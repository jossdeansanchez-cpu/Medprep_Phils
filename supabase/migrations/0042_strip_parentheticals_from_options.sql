-- Strip the parenthetical glosses that give answers away.
--
-- Question writers tend to clarify the right answer and nobody else:
-- "The developing scrotal swellings (labioscrotal folds)", "The spleen (within
-- the splenorenal ligament)". Measured over the active bank, 16.4% of correct
-- options carried a parenthetical against 3.1% of distractors, and in 715
-- questions the correct option was the only one with one. A student could pick
-- the option with brackets and be right far more often than chance.
--
-- Only glosses go. A parenthetical survives when it is doing real work:
--   - math and formulas: "(2x − 6)(x + 3)", "(y − x)/(y + x)", "MAP = DBP + 1/3(SBP - DBP)"
--   - notation with no space before it: "t(9;22) BCR-ABL1", "2(x³ − 9x)"
--   - an option that opens with a bracket: "(+) Posttussive emesis"
--   - chemistry with square brackets inside: "([SO2]^2 [O2])"
-- And a whole question is skipped when stripping would empty an option, touch
-- nested brackets, or make two options identical, as in "every four (6) hours"
-- vs "every four (4) hours" where the bracket is the only difference. 11 were.
--
-- Result on the active bank: 1,044 questions, 1,361 options. Correct options
-- with a parenthetical fall to 0.5%, distractors to 0.4%. Labels, positions and
-- the answer key never change. Explanations are untouched, so the detail that
-- came out of the option is still in the rationale.
--
-- Idempotent: the bank is rebuilt from the backup, and the snapshot pass only
-- touches rows still holding the original text.

create or replace function public.strip_option_gloss(p_text text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select btrim(regexp_replace(
    regexp_replace(p_text,
      '(?<=[^\s(/^*×+−=])\s+\([^()\[\]^=]*\)(?!\s*[(/^*×+−=])', '', 'g'),
    '\s{2,}', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Backups, so this is reversible
-- ---------------------------------------------------------------------------

create table if not exists public.questions_paren_backup (
  id           uuid primary key,
  options      jsonb not null,
  backed_up_at timestamptz not null default now()
);
alter table public.questions_paren_backup enable row level security;
revoke all on public.questions_paren_backup from anon, authenticated;

-- Old text to new text per question. Drives the snapshot pass below, and is
-- what you would reverse to restore the attempts.
create table if not exists public.questions_paren_text_map (
  question_id uuid not null,
  old_text    text not null,
  new_text    text not null,
  primary key (question_id, old_text)
);
alter table public.questions_paren_text_map enable row level security;
revoke all on public.questions_paren_text_map from anon, authenticated;

with o as (
  select q.id as qid,
         e.val->>'text' as t,
         case when e.val->>'text' ~ '\(' then public.strip_option_gloss(e.val->>'text')
              else e.val->>'text' end as st
  from public.questions q, jsonb_array_elements(q.options) e(val)
  where q.deleted_at is null
),
eligible as (
  select qid
  from o
  group by qid
  having bool_or(st is distinct from t)
     and not bool_or(st = '')
     and not bool_or(t ~ '\([^()]*\(')
     and count(distinct st) = count(distinct t)
)
insert into public.questions_paren_backup (id, options)
select q.id, q.options
from public.questions q
join eligible el on el.qid = q.id
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The bank
-- ---------------------------------------------------------------------------

-- Rebuilt from the backup rather than the live row, so a second run can't strip
-- twice. jsonb_set keeps image_path and any other key; ordinality keeps order.
update public.questions q
   set options = (
     select jsonb_agg(
              case when e.val->>'text' ~ '\('
                   then jsonb_set(e.val, '{text}', to_jsonb(public.strip_option_gloss(e.val->>'text')))
                   else e.val end
              order by e.ord)
     from jsonb_array_elements(b.options) with ordinality e(val, ord)
   )
  from public.questions_paren_backup b
 where b.id = q.id;

insert into public.questions_paren_text_map (question_id, old_text, new_text)
select distinct b.id, ol.val->>'text', nw.val->>'text'
from public.questions_paren_backup b
join public.questions q on q.id = b.id
cross join lateral jsonb_array_elements(b.options) with ordinality ol(val, ord)
join lateral jsonb_array_elements(q.options) with ordinality nw(val, ord) on nw.ord = ol.ord
where ol.val->>'text' is not null
  and ol.val->>'text' is distinct from nw.val->>'text'
on conflict (question_id, old_text) do nothing;

-- ---------------------------------------------------------------------------
-- Attempts already started
-- ---------------------------------------------------------------------------

-- Migration 0040 froze each attempt's options in its own order, so the edit is
-- matched by text, not position. Only text changes; no label moves.
update public.attempt_questions aq
   set options = (
     select jsonb_agg(
              case when mp.new_text is not null
                   then jsonb_set(e.val, '{text}', to_jsonb(mp.new_text))
                   else e.val end
              order by e.ord)
     from jsonb_array_elements(aq.options) with ordinality e(val, ord)
     left join public.questions_paren_text_map mp
            on mp.question_id = aq.question_id
           and mp.old_text = e.val->>'text'
   )
 where aq.options is not null
   and exists (
     select 1 from public.questions_paren_text_map mp
     where mp.question_id = aq.question_id
       and aq.options @> jsonb_build_array(jsonb_build_object('text', mp.old_text))
   );
