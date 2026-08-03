-- Admins grant plans by hand for students who pay outside PayMongo (GCash
-- straight to the admin is common here). Until now admin_set_plan always wrote
-- current_period_end = now() + 100 years, so every manual grant was permanent:
-- there was no way to sell "Pro for 6 months" without remembering to revoke it.
--
-- The end date is now an explicit argument. NULL means genuinely no expiry,
-- which current_entitlements() and effective_plan() already treat as entitled
-- (`current_period_end is null or current_period_end > now()`) — so this
-- replaces the 100-year sentinel with the real thing rather than a stand-in.
--
-- Dropping rather than replacing: adding a parameter to an existing function
-- creates an overload, and two overloads that both have defaults make calls
-- ambiguous.

drop function if exists public.admin_set_plan(uuid, public.plan_tier, public.billing_interval);

create or replace function public.admin_set_plan(
  p_user_id  uuid,
  p_plan     public.plan_tier,
  p_ends_at  timestamptz default null,   -- null = no expiry
  p_interval public.billing_interval default 'year'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  -- Guard against a typo silently granting nothing: an end date in the past
  -- would leave the student on a plan they can't use.
  if p_plan <> 'free' and p_ends_at is not null and p_ends_at <= now() then
    raise exception 'That validity date is already in the past.';
  end if;

  insert into public.subscriptions (user_id, plan, status, interval, current_period_end, updated_at)
  values (
    p_user_id,
    p_plan,
    case when p_plan = 'free' then 'inactive' else 'active' end,
    p_interval,
    -- Dropping to free clears the date; there is no period left to honour.
    case when p_plan = 'free' then null else p_ends_at end,
    now()
  )
  on conflict (user_id) do update
    set plan               = excluded.plan,
        status             = excluded.status,
        interval           = excluded.interval,
        current_period_end = excluded.current_period_end,
        updated_at         = now();
end;
$$;

revoke all on function public.admin_set_plan(uuid, public.plan_tier, timestamptz, public.billing_interval) from public;
grant execute on function public.admin_set_plan(uuid, public.plan_tier, timestamptz, public.billing_interval) to authenticated;
