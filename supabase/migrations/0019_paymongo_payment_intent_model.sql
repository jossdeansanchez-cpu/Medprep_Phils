-- Billing model is now one-time PayMongo Payment Intents per renewal period
-- (not auto-recurring Subscriptions — no Customer/Subscription objects are
-- created anymore, so those id columns no longer apply).
alter table public.subscriptions drop column if exists paymongo_customer_id;
alter table public.subscriptions drop column if exists paymongo_subscription_id;
alter table public.subscriptions add column if not exists paymongo_last_payment_id text;
comment on column public.subscriptions.paymongo_last_payment_id is 'Most recent successful PayMongo payment id (pay_...), for support/debugging.';
