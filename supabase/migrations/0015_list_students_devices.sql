-- Add each student's active device count to the admin students list.
drop function if exists public.list_students();
create or replace function public.list_students()
returns table (
  id                 uuid,
  full_name          text,
  email              text,
  role               public.user_role,
  plan               plan_tier,
  status             text,
  is_paid            boolean,
  current_period_end timestamptz,
  device_count       bigint,
  created_at         timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
  select p.id, p.full_name, u.email::text, p.role,
         coalesce(
           case when s.status in ('active','trialing') then s.plan else 'free'::plan_tier end,
           'free'::plan_tier
         ),
         coalesce(s.status, 'inactive'),
         (s.stripe_subscription_id is not null),
         s.current_period_end,
         (select count(*) from public.user_devices d where d.user_id = p.id),
         p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.subscriptions s on s.user_id = p.id
  order by p.created_at desc;
end;
$$;
