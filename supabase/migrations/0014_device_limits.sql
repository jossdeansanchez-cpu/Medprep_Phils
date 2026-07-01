-- Per-account device limit (anti account-sharing). Devices are identified by a
-- cookie set in middleware. Enforcement is server-side via register_device.

create table public.user_devices (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  device_id  text not null,
  user_agent text,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.user_devices enable row level security;
-- Users can view and remove their own devices; inserts/updates go through the RPC.
create policy "devices read own" on public.user_devices
  for select using (user_id = auth.uid());
create policy "devices delete own" on public.user_devices
  for delete using (user_id = auth.uid());

create or replace function public.device_limit(p plan_tier)
returns int language sql immutable as $$
  select case p
    when 'max_pro' then 3
    when 'pro' then 2
    when 'basic' then 1
    else 1 end;
$$;

-- Register/heartbeat the current device and report whether it is allowed.
-- Only the first N devices (by first_seen) are allowed, where N is the plan's
-- limit; a new device beyond the limit is refused (not stored). Admins exempt.
create or replace function public.register_device(p_device text, p_user_agent text default null)
returns table (allowed boolean, device_count int, max_devices int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_count  int;
  v_exists boolean;
  v_rank   int;
begin
  if v_uid is null or p_device is null or p_device = '' then
    return query select true, 0, 0;
    return;
  end if;

  if public.is_admin() then
    v_limit := 999; -- operators are never device-limited
  else
    v_limit := public.device_limit(public.effective_plan());
  end if;

  select exists (
    select 1 from public.user_devices where user_id = v_uid and device_id = p_device
  ) into v_exists;

  if v_exists then
    update public.user_devices
      set last_seen = now(), user_agent = coalesce(p_user_agent, user_agent)
      where user_id = v_uid and device_id = p_device;
  else
    select count(*) into v_count from public.user_devices where user_id = v_uid;
    if v_count < v_limit then
      insert into public.user_devices (user_id, device_id, user_agent)
      values (v_uid, p_device, p_user_agent);
    else
      select count(*) into v_count from public.user_devices where user_id = v_uid;
      return query select false, v_count, v_limit;
      return;
    end if;
  end if;

  -- Rank by first_seen so a plan downgrade blocks the newest device(s).
  select r.rnk into v_rank
  from (
    select device_id, row_number() over (order by first_seen) as rnk
    from public.user_devices where user_id = v_uid
  ) r
  where r.device_id = p_device;

  select count(*) into v_count from public.user_devices where user_id = v_uid;
  return query select (v_rank <= v_limit), v_count, v_limit;
end;
$$;
