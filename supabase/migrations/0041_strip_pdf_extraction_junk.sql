-- Strip PDF extraction junk out of question text.
--
-- These questions were imported from PDF handouts and the extractor glued the
-- page footer onto whatever text ran up to the page boundary. It always landed
-- on the last option, so students were reading answer D as:
--
--   "Immunotherapy TOPNOTCH MEDICAL BOARD PREP PEDIATRICS PRACTICE TEST HANDOUT
--    BY DR. ARADA For inquiries visit www.topnotchboardprep.com.ph or ... This
--    handout is only valid for October 2022 PLE batch..."
--
-- Two patterns, both narrow on purpose:
--
--   1. Everything from "=== PAGE BREAK ===" or "TOPNOTCH MEDICAL BOARD PREP"
--      to the end. 33 options across 33 questions, plus 1 stem. Every one is
--      the last option; none becomes empty; the shortest survivor is "4",
--      which is a real answer.
--   2. A trailing bare "RATIONALE" — the start of the rationale section
--      bleeding in. 5 options. Anchored to the end and case-sensitive, so the
--      many stems that legitimately discuss "the rationale for X" are untouched.
--
-- Idempotent: running it twice changes nothing.

-- ---------------------------------------------------------------------------
-- Backup, so this is reversible
-- ---------------------------------------------------------------------------

create table if not exists public.questions_pdf_junk_backup (
  id           uuid primary key,
  stem         text,
  options      jsonb,
  backed_up_at timestamptz not null default now()
);

alter table public.questions_pdf_junk_backup enable row level security;
revoke all on public.questions_pdf_junk_backup from anon, authenticated;

insert into public.questions_pdf_junk_backup (id, stem, options)
select q.id, q.stem, q.options
from public.questions q
where q.stem ~ '(===\s*PAGE BREAK\s*===|TOPNOTCH MEDICAL BOARD PREP)'
   or exists (
     select 1 from jsonb_array_elements(q.options) e
     where e->>'text' ~ '(===\s*PAGE BREAK\s*===|TOPNOTCH MEDICAL BOARD PREP)'
        or e->>'text' ~ '\yRATIONALE\s*$'
   )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The bank
-- ---------------------------------------------------------------------------

update public.questions q
   set stem = btrim(regexp_replace(
         q.stem, '\s*(===\s*PAGE BREAK\s*===|TOPNOTCH MEDICAL BOARD PREP).*$', '', 'is'))
 where q.stem ~ '(===\s*PAGE BREAK\s*===|TOPNOTCH MEDICAL BOARD PREP)';

-- jsonb_set rather than a rebuilt object, so image_path and any other key on an
-- option survive; ordinality keeps the array in its original order and the
-- labels are never touched, so no answer key moves.
update public.questions q
   set options = (
     select jsonb_agg(
              case when e.val ? 'text'
                   then jsonb_set(e.val, '{text}',
                          to_jsonb(btrim(regexp_replace(
                            regexp_replace(e.val->>'text',
                              '\s*(===\s*PAGE BREAK\s*===|TOPNOTCH MEDICAL BOARD PREP).*$', '', 'is'),
                            '\s+RATIONALE\s*$', ''))))
                   else e.val end
              order by e.ord)
     from jsonb_array_elements(q.options) with ordinality e(val, ord)
   )
 where exists (
   select 1 from jsonb_array_elements(q.options) e
   where e->>'text' ~ '(===\s*PAGE BREAK\s*===|TOPNOTCH MEDICAL BOARD PREP)'
      or e->>'text' ~ '\yRATIONALE\s*$'
 );

-- ---------------------------------------------------------------------------
-- Attempts already sat
-- ---------------------------------------------------------------------------

-- Migration 0040 froze each attempt's options, so cleaning the bank alone would
-- leave the junk on every past review. Same edit applied to the snapshots: only
-- the text changes, never a label or a position, so no stored answer moves.
update public.attempt_questions aq
   set options = (
     select jsonb_agg(
              case when e.val ? 'text'
                   then jsonb_set(e.val, '{text}',
                          to_jsonb(btrim(regexp_replace(
                            regexp_replace(e.val->>'text',
                              '\s*(===\s*PAGE BREAK\s*===|TOPNOTCH MEDICAL BOARD PREP).*$', '', 'is'),
                            '\s+RATIONALE\s*$', ''))))
                   else e.val end
              order by e.ord)
     from jsonb_array_elements(aq.options) with ordinality e(val, ord)
   )
 where exists (
   select 1 from jsonb_array_elements(aq.options) e
   where e->>'text' ~ '(===\s*PAGE BREAK\s*===|TOPNOTCH MEDICAL BOARD PREP)'
      or e->>'text' ~ '\yRATIONALE\s*$'
 );
