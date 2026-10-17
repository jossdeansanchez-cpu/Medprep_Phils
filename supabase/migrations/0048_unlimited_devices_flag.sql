-- A per-account escape hatch from the device cap.
--
-- Google Play rejected the first production submission with "Login credentials
-- are missing": the Android app opens straight onto /login, so a reviewer with
-- no account sees a sign-in form and nothing else. The fix is to hand Play a
-- demo account — but a demo account on Max Pro gets device_limit() = 3, and a
-- review team working across several devices or emulators would hit
-- DeviceLimitBlock. From the outside that is indistinguishable from "we could
-- not access the app", which is the same rejection a second time.
--
-- is_admin() already bypasses the cap, but handing Play an admin login would
-- expose the question bank, the student list and the announcement composer. So
-- the exemption gets its own flag, settable on an ordinary student account.
--
-- Useful beyond review: comped accounts, support reproducing a bug, and the
-- owner's own phones.

alter table public.profiles
  add column if not exists unlimited_devices boolean not null default false;

comment on column public.profiles.unlimited_devices is
  'Bypasses the per-plan device cap. For store-review and support accounts; '
  'never set this for an ordinary paying student.';

-- Same body as migration 0034, with the exemption folded into the one branch
-- that decides the limit. The 2-arg overload is deliberately left alone: the app
-- always passes p_platform, so this is the only live path.
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
  v_exempt   boolean;
begin
  if v_uid is null or p_device is null or p_device = '' then
    return query select true, 0, 0;
    return;
  end if;

  select coalesce(pr.unlimited_devices, false) into v_exempt
    from public.profiles pr where pr.id = v_uid;

  if public.is_admin() or coalesce(v_exempt, false) then
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
