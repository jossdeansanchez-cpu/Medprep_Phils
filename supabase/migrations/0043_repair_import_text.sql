-- Repair text the importer mangled, and take broken questions out of rotation.
--
-- Three faults, all from spreadsheet and PDF imports:
--
--   1. U+FFFD (the "?" diamond) in 669 fields across 590 questions. Files saved
--      as Windows-1252 were read as UTF-8, so every ’ – ° ö β became the same
--      replacement character. The original byte is gone, so this repairs by
--      context rather than decoding:
--        between two words, a dash or bullet      → " – "
--        letter's, workers', paired quotes        → '
--        38°C, 70°F                               → °
--        24 – 48 hours between two numbers        → 24–48 hours
--        Sjögren, Schönlein, β2-agonist, /µL      → by name
--      Next to a number it could be ≥, ≤, > or <, and a wrong guess changes the
--      medicine. Those are fixed one question at a time against the source
--      criteria: SIRS (> and <), ADA diabetes (≥), Berlin ARDS (≤), TST
--      induration (≥), FEV1 reversibility (≥), hydroxychloroquine (≤5 mg/kg),
--      RA 9165 (≥ 500 g) and natalizumab's target, α4β1 integrin.
--   2. Two options with the next item glued on: "IIIB 33. Which of the
--      following refers to a distal radius fracture..." and "...febrile
--      DISCUSSION 1. C. 9", which printed an answer key inside a wrong choice.
--   3. Eight Chemistry questions with "#ERROR!" options, where a spreadsheet
--      evaluated "+120 kJ" as a formula. The text is unrecoverable and none has
--      been served, so they are deactivated rather than guessed at.
--
-- Only text changes; no label, position or answer key moves. Options changed
-- here are carried into the per-attempt snapshots from 0040 by exact text.
-- Originals are kept in questions_textfix_backup and questions_textfix_map.
--
-- Idempotent: every rule matches only text that still has the fault.

create or replace function public.repair_import_text(p_qid uuid, p_field text, p_text text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $fn$
declare
  f constant text := chr(65533);
  t text := p_text;
begin
  if t is null then return null; end if;

  -- Meaning-critical: the replacement depends on the clinical criterion.
  if p_qid = '7f7405cf-d078-4914-8776-54ec976bc4f5' then
    t := replace(t, '-Temp '||f||' 38'||f||'C or '||f||' 36'||f||'C; HR '||f||' 90 beats/min; RR '||f||' 20/min or PaCO2 '||f||' 32mmHg or mechanical ventilation; WBC '||f||' 12,000/_L or '||f||' 4,000/_L or '||f||' 10% bands.',
                    '-Temp > 38°C or < 36°C; HR > 90 beats/min; RR > 20/min or PaCO2 < 32mmHg or mechanical ventilation; WBC > 12,000/µL or < 4,000/µL or > 10% bands.');
  elsif p_qid = '0ab6f94c-1c7c-40b6-a305-6b97792d2c34' then
    t := replace(t, 'for '||f||' 500 grams', 'for ≥ 500 grams');
  elsif p_qid = '22332b65-a61f-447c-bc6b-0bae706cb08e' then
    t := replace(t, '4th '||f||' 5th', '4th–5th');
  elsif p_qid = '293cd651-aa21-4038-8865-c53399846130' then
    t := replace(t, 'Champignon d'||f||'ocume', 'Champignon d''écume');
  elsif p_qid = '2cc15e4d-b516-415e-b1b7-3d4a04b2430a' then
    t := replace(t, 'T '||f||' 40 deg C and HR '||f||' 45', 'T 40 deg C and HR 45');
  elsif p_qid = '324e7065-bda6-490a-b36e-dd68278ec3cd' and p_field = 'explanation' and btrim(t) = f then
    return null;
  elsif p_qid = '3df61e50-ba14-4d60-be3e-2cf83caae537' then
    t := replace(t, '('||f||'5 mg/kg)', '(≤5 mg/kg)');
  elsif p_qid = '0a7bb415-0ede-4423-a32c-6fdac1493fc7' then
    t := replace(t, 'the a4 subunit of a4'||f||'1 integrin', 'the α4 subunit of α4β1 integrin');
  elsif p_qid = '416d1b07-c962-4a14-a472-a71a32c47e7e' then
    t := replace(t, '85%'||f||'90%', '85%–90%');
  elsif p_qid = 'da78c504-1a03-4cf0-9522-c204c40f656f' then
    t := replace(t, 'PaO2/FiO2 '||f, 'PaO2/FiO2 ≤');
  elsif p_qid in ('e08902d6-ef3e-4e30-9fbc-8aab013d4059',
                  'fbc0a656-5506-4099-8a58-7f6472f01aa0',
                  'daefbb79-825b-4c71-877b-fdf91e53f517') then
    t := regexp_replace(t, f||'(\d)', '≥\1', 'g');
  elsif p_qid in ('57831b75-224a-488b-8304-14687799b08c',
                  'ccbb36ca-9d2b-4382-8131-b85649663e77',
                  'fcfbbd33-8718-41f2-8651-d4662cbb566a') then
    t := replace(t, f||'3rd eye'||f||' '||f||'6th sense'||f, '''3rd eye'' ''6th sense''');
  end if;

  -- The next item or the rationale pasted into an option.
  if p_field = 'option' then
    if p_qid = 'ced41b5e-38bd-4d74-8f82-bd580dd3a7ca' then
      t := regexp_replace(t, '\s+DISCUSSION\y.*$', '');
    elsif p_qid = '487b5c40-d820-4b9c-a7b2-59eaf87b4ceb' then
      t := regexp_replace(t, '^IIIB\s+33\.\s+Which of the following.*$', 'IIIB');
    end if;
  end if;

  -- Unambiguous by context. Order matters: possessives and separators go
  -- before quote pairing, or " – " would pair up as quotation marks.
  t := regexp_replace(t, '(\d)\s?'||f||'\s?([CF])\y', '\1°\2', 'g');
  t := regexp_replace(t, '(\d)\s'||f||'\s(\d)', '\1–\2', 'g');
  t := replace(t, 'Sj'||f||'gren', 'Sjögren');
  t := replace(t, 'SJ'||f||'GREN', 'SJÖGREN');
  t := replace(t, 'Sch'||f||'nlein', 'Schönlein');
  t := replace(t, 'cutter'||f||'like', 'cutter-like');
  t := regexp_replace(t, '\y_2-(agonist)', 'β2-\1', 'gi');
  t := replace(t, '/_L', '/µL');
  t := regexp_replace(t, '([A-Za-z])'||f||'([sS])\y', '\1''\2', 'g');
  t := regexp_replace(t, '\s'||f||'\s', ' – ', 'g');
  t := regexp_replace(t, '(^|[\s(\[:;,])'||f||'([^\s'||f||'][^'||f||']{0,80}?)'||f||'(?=$|[\s.,;:!?)\]])', '\1''\2''', 'g');
  t := regexp_replace(t, '([A-Za-z.,;:!?])'||f||'(?=$|[\s.,;:!?)\]])', '\1''', 'g');
  t := regexp_replace(t, '(\s)'||f||'(?=[A-Z])', '\1– ', 'g');
  return t;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Backups, so this is reversible
-- ---------------------------------------------------------------------------

create table if not exists public.questions_textfix_backup (
  id           uuid primary key,
  stem         text,
  options      jsonb,
  explanation  text,
  backed_up_at timestamptz not null default now()
);
alter table public.questions_textfix_backup enable row level security;
revoke all on public.questions_textfix_backup from anon, authenticated;

create table if not exists public.questions_textfix_map (
  question_id uuid not null,
  old_text    text not null,
  new_text    text not null,
  primary key (question_id, old_text)
);
alter table public.questions_textfix_map enable row level security;
revoke all on public.questions_textfix_map from anon, authenticated;

insert into public.questions_textfix_backup (id, stem, options, explanation)
select q.id, q.stem, q.options, q.explanation
from public.questions q
where q.deleted_at is null
  and (public.repair_import_text(q.id, 'stem', q.stem) is distinct from q.stem
    or public.repair_import_text(q.id, 'explanation', q.explanation) is distinct from q.explanation
    or exists (select 1 from jsonb_array_elements(q.options) e
               where public.repair_import_text(q.id, 'option', e->>'text') is distinct from e->>'text'))
on conflict (id) do nothing;

insert into public.questions_textfix_map (question_id, old_text, new_text)
select distinct b.id, e.val->>'text', public.repair_import_text(b.id, 'option', e.val->>'text')
from public.questions_textfix_backup b
cross join lateral jsonb_array_elements(b.options) e(val)
where e.val->>'text' is not null
  and public.repair_import_text(b.id, 'option', e.val->>'text') is distinct from e.val->>'text'
on conflict (question_id, old_text) do nothing;

-- ---------------------------------------------------------------------------
-- The bank
-- ---------------------------------------------------------------------------

-- Repaired from the live row, not the backup, so a re-run can't overwrite an
-- edit made since. jsonb_set keeps image_path; ordinality keeps order.
update public.questions q
   set stem        = public.repair_import_text(q.id, 'stem', q.stem),
       explanation = public.repair_import_text(q.id, 'explanation', q.explanation),
       options     = (
         select jsonb_agg(
                  case when e.val ? 'text'
                       then jsonb_set(e.val, '{text}', to_jsonb(public.repair_import_text(q.id, 'option', e.val->>'text')))
                       else e.val end
                  order by e.ord)
         from jsonb_array_elements(q.options) with ordinality e(val, ord)
       )
 where q.id in (select id from public.questions_textfix_backup);

-- ---------------------------------------------------------------------------
-- Attempts already started
-- ---------------------------------------------------------------------------

update public.attempt_questions aq
   set options = (
     select jsonb_agg(
              case when mp.new_text is not null
                   then jsonb_set(e.val, '{text}', to_jsonb(mp.new_text))
                   else e.val end
              order by e.ord)
     from jsonb_array_elements(aq.options) with ordinality e(val, ord)
     left join public.questions_textfix_map mp
            on mp.question_id = aq.question_id
           and mp.old_text = e.val->>'text'
   )
 where aq.options is not null
   and exists (
     select 1 from public.questions_textfix_map mp
     where mp.question_id = aq.question_id
       and aq.options @> jsonb_build_array(jsonb_build_object('text', mp.old_text))
   );

-- ---------------------------------------------------------------------------
-- Spreadsheet formula errors
-- ---------------------------------------------------------------------------

update public.questions
   set is_active = false
 where deleted_at is null
   and is_active
   and exists (
     select 1 from jsonb_array_elements(options) e
     where e->>'text' ~ '^#(ERROR!|REF!|VALUE!|NAME\?|N/A|DIV/0!|NUM!|NULL!)$'
   );

drop function public.repair_import_text(uuid, text, text);
