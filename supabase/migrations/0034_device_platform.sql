-- The iOS app is a Capacitor WebView pointing at medprepacad.com, and a WebView
-- has its own storage jar. `md_device` inside the app is therefore a different
-- UUID from the one Safari holds on the very same phone, so the app registers
-- as a *second* device. With free and basic capped at one, a student who
-- already uses the site in Safari would install the app and be met by
-- DeviceLimitBlock instead of their dashboard.
--
-- Rather than raising every tier — which would hand extra devices to web-only
-- students who will never install the app — devices are now counted in two
-- pools. Browsers keep the plan's advertised limit exactly as before; the app
-- gets one slot of its own. Installing the app costs a student nothing, and
-- nobody gains a browser slot they didn't pay for.
--
-- One app install per account, on every tier: a Max Pro student wanting the app
-- on a second phone must free the slot from /account. That is the same trade
-- the limit already makes for browsers, and it keeps the tightest bound on
-- account sharing, which is what the limit exists for.

alter table public.user_devices
  add column if not exists platform text not null default 'web'
  check (platform in ('web', 'ios-app'));

-- How many of a given kind a plan allows. Browsers keep device_limit(); the
-- native app is a flat one, independent of tier.
create or replace function public.platform_device_limit(
  p_plan public.plan_tier,
  p_platform text
)
returns integer
language sql
immutable
as $$
  select case when p_platform = 'ios-app' then 1 else public.device_limit(p_plan) end;
$$;

-- Same contract as before, plus p_platform. Counting, the limit returned to the
-- caller, and the "is this device within the allowance" rank check are all now
-- scoped to the requesting device's own pool.
create or replace function public.register_device(
  p_device     text,
  p_user_agent text default null,
  p_platform   text default 'web'
)
returns table(allowed boolean, device_count integer, max_devices integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_platform text := case when p_platform = 'ios-app' then 'ios-app' else 'web' end;
  v_limit    int;
  v_count    int;
  v_exists   boolean;
  v_rank     int;
begin
  if v_uid is null or p_device is null or p_device = '' then
    return query select true, 0, 0;
    return;
  end if;

  if public.is_admin() then
    v_limit := 999;
  else
    v_limit := public.platform_device_limit(public.effective_plan(), v_platform);
  end if;

  select exists (
    select 1 from public.user_devices where user_id = v_uid and device_id = p_device
  ) into v_exists;

  if v_exists then
    update public.user_devices
      set last_seen = now(),
          user_agent = coalesce(p_user_agent, user_agent),
          -- A device that starts reporting as the app keeps its row and simply
          -- moves pool, so upgrading from the PWA to the App Store build does
          -- not strand the old row.
          platform = v_platform
      where user_id = v_uid and device_id = p_device;
  else
    select count(*) into v_count
      from public.user_devices where user_id = v_uid and platform = v_platform;
    if v_count < v_limit then
      insert into public.user_devices (user_id, device_id, user_agent, platform)
      values (v_uid, p_device, p_user_agent, v_platform);
    else
      return query select false, v_count, v_limit;
      return;
    end if;
  end if;

  select r.rnk into v_rank
  from (
    select device_id, row_number() over (order by first_seen) as rnk
    from public.user_devices
    where user_id = v_uid and platform = v_platform
  ) r
  where r.device_id = p_device;

  select count(*) into v_count
    from public.user_devices where user_id = v_uid and platform = v_platform;

  return query select (v_rank <= v_limit), v_count, v_limit;
end;
$$;
