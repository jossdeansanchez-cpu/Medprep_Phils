-- Admin-only student management. Lets an admin create pre-confirmed student
-- accounts (no email round-trip) and list existing students with their emails.
-- SECURITY DEFINER so the function can write the auth schema; every call is
-- gated by public.is_admin(). Keeps the app's no-service-role-key design.

create or replace function public.admin_create_student(
  p_email     text,
  p_password  text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid   uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Please enter a valid email address';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'A user with this email already exists';
  end if;

  -- Pre-confirmed user. Token columns must be '' (not null) or GoTrue login fails.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', nullif(trim(p_full_name), '')),
    now(), now(),
    '', '', '', '', '', '', '', '',
    false, false
  );
  -- The on_auth_user_created trigger creates the matching public.profiles row
  -- (role = student, since an admin already exists).

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email),
    'email', v_email, now(), now(), now()
  );

  return v_uid;
end;
$$;

create or replace function public.list_students()
returns table (
  id         uuid,
  full_name  text,
  email      text,
  role       public.user_role,
  created_at timestamptz
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
  select p.id, p.full_name, u.email::text, p.role, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;
