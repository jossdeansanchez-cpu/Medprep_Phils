-- Images in questions, for NMAT Perceptual Acuity.
--
-- PA is a visual subject: the stem is a figure and the answer choices are
-- usually figures too, often with no text at all. Until now a question was
-- text-only — `stem` is text and each option is {label, text}.
--
-- Two notes on the shape of this:
--
--  1. Option images need NO schema change. `options` is jsonb, so an
--     `image_path` key just rides along inside each option object, and
--     get_attempt_questions already returns q.options untouched. Only the stem
--     needs a real column.
--
--  2. We store PATHS, never URLs. The bucket is private; the Next.js server
--     signs a short-lived URL at render time. A path on its own is useless to
--     anyone without the signature, which is why it is safe to hand paths to
--     the RPCs and let the server component swap them for signed URLs.

alter table public.questions add column stem_image_path text;

comment on column public.questions.stem_image_path is
  'Object path in the private question-images bucket. NULL for text-only questions. Never a URL — the server signs it at render time.';

-- ── Bucket ───────────────────────────────────────────────────────────────────
-- Private: the question bank is the paid product, and a public bucket would
-- make the imagery scrapeable by anyone who can guess a URL. (The answer key is
-- protected either way — correct_label never leaves the SECURITY DEFINER RPCs.)
--
-- 2 MB ceiling is generous for the line art PA uses; the upload path downscales
-- and re-encodes to WebP on the client first, because image transformation is
-- not available on this project's plan.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  false,
  2097152,
  array['image/webp', 'image/png', 'image/jpeg', 'image/gif']
)
on conflict (id) do nothing;

-- ── Bucket access ────────────────────────────────────────────────────────────
-- Admins only, for every verb. Students are deliberately absent: they never
-- read this bucket directly. A signed URL carries its own authority and
-- bypasses RLS entirely, which is exactly how their images load.

drop policy if exists "question images admin read"   on storage.objects;
drop policy if exists "question images admin insert" on storage.objects;
drop policy if exists "question images admin update" on storage.objects;
drop policy if exists "question images admin delete" on storage.objects;

create policy "question images admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'question-images' and public.is_admin());

create policy "question images admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'question-images' and public.is_admin());

create policy "question images admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'question-images' and public.is_admin())
  with check (bucket_id = 'question-images' and public.is_admin());

create policy "question images admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'question-images' and public.is_admin());

-- ── RPCs gain stem_image_path ────────────────────────────────────────────────
-- These have to be dropped rather than replaced: Postgres will not let
-- CREATE OR REPLACE change a function's RETURNS TABLE. Both bodies are
-- otherwise identical to 0036 / 0003. Neither had an explicit grant — they rely
-- on the default EXECUTE to PUBLIC, which a fresh CREATE restores.
--
-- Options are returned as-is, so any image_path inside them comes along free.

drop function if exists public.get_attempt_questions(uuid);

create function public.get_attempt_questions(p_attempt_id uuid)
returns table (
  attempt_question_id uuid,
  question_id         uuid,
  subject_id          uuid,
  subject_name        text,
  item_no             integer,
  stem                text,
  stem_image_path     text,
  options             jsonb,
  selected_label      text,
  revealed            boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (
    select 1 from public.exam_attempts a
    where a.id = p_attempt_id
      and (a.user_id = auth.uid() or public.is_admin())
  ) then
    raise exception 'Attempt not found';
  end if;

  return query
  select aq.id, aq.question_id, aq.subject_id, s.name, aq.position,
         q.stem, q.stem_image_path, q.options, aq.selected_label,
         (aq.revealed_at is not null)
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  join public.subjects s on s.id = aq.subject_id
  where aq.attempt_id = p_attempt_id
  order by aq.position;
end;
$fn$;

drop function if exists public.get_attempt_review(uuid);

create function public.get_attempt_review(p_attempt_id uuid)
returns table (
  item_no         integer,
  subject_id      uuid,
  subject_name    text,
  stem            text,
  stem_image_path text,
  options         jsonb,
  selected_label  text,
  correct_label   text,
  is_correct      boolean,
  explanation     text
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (
    select 1 from public.exam_attempts a
    where a.id = p_attempt_id
      and (a.user_id = auth.uid() or public.is_admin())
      and a.status = 'submitted'
  ) then
    raise exception 'Review not available';
  end if;

  return query
  select aq.position, aq.subject_id, s.name, q.stem, q.stem_image_path, q.options,
         aq.selected_label, q.correct_label, aq.is_correct, q.explanation
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  join public.subjects s on s.id = aq.subject_id
  where aq.attempt_id = p_attempt_id
  order by aq.position;
end;
$fn$;
