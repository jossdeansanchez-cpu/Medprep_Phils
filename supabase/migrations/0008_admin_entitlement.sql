-- Admins are the app operators and should never hit the paywall — treat them
-- as Max Pro for all entitlement checks.

create or replace function public.effective_plan()
returns plan_tier language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then 'max_pro'::plan_tier
    when s.status in ('active','trialing') then s.plan
    else 'free'::plan_tier end
  from (select auth.uid() as uid) me
  left join public.subscriptions s on s.user_id = me.uid;
$$;

create or replace function public.current_entitlements()
returns table (plan plan_tier, status text, entitled boolean, current_period_end timestamptz)
language sql stable security definer set search_path = public as $$
  select
    case when public.is_admin() then 'max_pro'::plan_tier
         when s.status in ('active','trialing') then coalesce(s.plan,'free'::plan_tier)
         else 'free'::plan_tier end,
    case when public.is_admin() then 'admin' else coalesce(s.status,'inactive') end,
    case when public.is_admin() then true
         else coalesce(s.status in ('active','trialing'), false) end,
    s.current_period_end
  from (select auth.uid() as uid) me
  left join public.subscriptions s on s.user_id = me.uid;
$$;
