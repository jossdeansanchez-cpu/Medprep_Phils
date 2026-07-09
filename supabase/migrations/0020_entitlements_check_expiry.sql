-- Manual (one-time payment) billing model: nothing external flips `status`
-- when a period lapses like a Stripe/PayMongo Subscription webhook would.
-- Entitlement must also require current_period_end to still be in the future.

create or replace function public.effective_plan()
returns plan_tier language sql stable security definer set search_path = public as $$
  select case
    when s.status in ('active','trialing')
     and (s.current_period_end is null or s.current_period_end > now())
    then s.plan
    else 'free'::plan_tier
  end
  from (select auth.uid() as uid) me
  left join public.subscriptions s on s.user_id = me.uid;
$$;

create or replace function public.current_entitlements()
returns table (plan plan_tier, status text, entitled boolean, current_period_end timestamptz)
language sql stable security definer set search_path = public as $$
  select
    case when s.status in ('active','trialing')
          and (s.current_period_end is null or s.current_period_end > now())
         then coalesce(s.plan,'free'::plan_tier)
         else 'free'::plan_tier end,
    coalesce(s.status, 'inactive'),
    coalesce(
      s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end > now()),
      false
    ),
    s.current_period_end
  from (select auth.uid() as uid) me
  left join public.subscriptions s on s.user_id = me.uid;
$$;
