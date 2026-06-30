-- Per-subject mastery across the caller's submitted attempts (for Max Pro analytics).
create or replace function public.my_subject_mastery()
returns table (subject_name text, answered int, pct numeric)
language sql stable security definer set search_path = public as $$
  select s.name,
         count(*)::int,
         round(100.0 * sum(case when aq.is_correct then 1 else 0 end) / nullif(count(*), 0), 1)
  from public.attempt_questions aq
  join public.exam_attempts a on a.id = aq.attempt_id
  join public.subjects s on s.id = aq.subject_id
  where a.user_id = auth.uid() and a.status = 'submitted'
  group by s.name
  order by 3 nulls last;
$$;
