-- Coverage grid: active question count per subject × exam category (admin only).
create or replace function public.admin_question_coverage()
returns table (
  subject_id   uuid,
  subject_name text,
  sort_order   int,
  category     exam_category,
  n            bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
  select s.id, s.name, s."order", c.category, count(q.id)
  from public.subjects s
  cross join (select unnest(enum_range(null::exam_category)) as category) c
  left join public.questions q
    on q.subject_id = s.id and q.category = c.category and q.is_active
  group by s.id, s.name, s."order", c.category
  order by s."order", c.category;
end;
$$;
