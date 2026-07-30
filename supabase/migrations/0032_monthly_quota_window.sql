-- Billing moves from monthly to annual (same peso prices), but the exam
-- allowances stay monthly: Basic 2 mock exams a month, Pro 10 a month.
--
-- That means the quota window can no longer be derived from the billing period.
-- The old definition was `current_period_end - interval '30 days'`, which only
-- worked while a period *was* 30 days. With a 1-year period it returns a date
-- ~11 months in the future, so `count(attempts started >= period_start)` is 0
-- and every plan would get unlimited mock exams for 11 months before clamping
-- shut in the final month. It also handed unlimited exams to admin-comped
-- accounts, whose current_period_end is now() + 100 years.
--
-- Quota window and access window are now separate concerns:
--   * current_period_end  -> may the student use the app at all (annual)
--   * this function       -> how much they may use this month (calendar month)
--
-- A calendar month is also what the free tier already used, so every tier now
-- resets on the same, easily explained schedule: the 1st of each month, UTC.
-- No longer reads subscriptions, so it no longer needs SECURITY DEFINER.

create or replace function public.entitlement_period_start()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$$;
