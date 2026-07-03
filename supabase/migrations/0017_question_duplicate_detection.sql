-- Trigram similarity for duplicate-question detection at upload/edit time.
-- (Upload date is already available via questions.created_at — surfaced in
-- the admin UI, no new column needed there.)

create extension if not exists pg_trgm with schema extensions;
create index if not exists questions_stem_trgm_idx
  on public.questions using gin (stem extensions.gin_trgm_ops);

-- Given a batch of (subject_id, stem) candidates, return existing active
-- questions in the same subject whose stem is textually similar (trigram
-- similarity), so the admin can be warned before importing near-duplicates.
-- Admin-only: reads full question stems via SECURITY DEFINER.
create or replace function public.find_similar_questions_batch(
  p_subject_ids uuid[],
  p_stems       text[],
  p_threshold   real default 0.45
)
returns table (
  row_index     int,
  question_id   uuid,
  existing_stem text,
  similarity    real
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select i.idx, m.id, m.stem, m.sim
  from generate_subscripts(p_stems, 1) as i(idx)
  cross join lateral (
    select q.id, q.stem, similarity(q.stem, p_stems[i.idx]) as sim
    from public.questions q
    where q.subject_id = p_subject_ids[i.idx]
      and q.is_active
      and similarity(q.stem, p_stems[i.idx]) >= p_threshold
    order by sim desc
    limit 3
  ) m;
end;
$$;
