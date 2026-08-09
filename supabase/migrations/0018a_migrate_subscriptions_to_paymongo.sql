-- Billing moved from Stripe to PayMongo. This is the column rename only; the
-- payment-intent model that depends on these names lands in 0019.
--
-- Numbered 0018a rather than renumbering everything from 0019 onward: it sorts
-- between 0018 and 0019, which is all this directory needs, since these files
-- are a hand-maintained record of what has been applied rather than a Supabase
-- CLI pipeline (there is no supabase/config.toml).
--
-- Recovered from the deployed migration history (version 20260708081452); this
-- migration had no file in the repo at all.

alter table public.subscriptions rename column stripe_customer_id to paymongo_customer_id;
alter table public.subscriptions rename column stripe_subscription_id to paymongo_subscription_id;

drop index if exists subscriptions_customer_idx;
create index subscriptions_customer_idx on public.subscriptions (paymongo_customer_id);

comment on column public.subscriptions.paymongo_customer_id is 'PayMongo customer id (cus_...)';
comment on column public.subscriptions.paymongo_subscription_id is 'PayMongo subscription id (sub_...)';
