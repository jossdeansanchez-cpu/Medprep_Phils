-- Admin announcements + a per-user "notifications seen" marker for unread counts.

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;
create policy "announcements read" on public.announcements
  for select using (auth.role() = 'authenticated');
create policy "announcements admin write" on public.announcements
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.profiles
  add column notifications_seen_at timestamptz;
