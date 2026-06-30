-- MEDprep initial schema: profiles, subjects, questions, exam templates, attempts.

-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.user_role as enum ('student', 'admin');
create type public.exam_mode as enum ('mock', 'practice');
create type public.attempt_status as enum ('in_progress', 'submitted');

-- ── profiles ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  role       public.user_role not null default 'student',
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER admin check — avoids RLS recursion when used inside policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Create a profile automatically when a new auth user signs up.
-- The very first account becomes an admin; everyone after is a student.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role public.user_role;
begin
  if (select count(*) from public.profiles) = 0 then
    assigned_role := 'admin';
  else
    assigned_role := 'student';
  end if;

  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', assigned_role);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── subjects ─────────────────────────────────────────────────────────────────
create table public.subjects (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  slug  text not null unique,
  "order" int not null default 0
);

-- ── questions ────────────────────────────────────────────────────────────────
create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references public.subjects (id) on delete restrict,
  stem          text not null,
  options       jsonb not null,            -- [{ "label": "A", "text": "..." }, ...]
  correct_label text not null,             -- "A".."E"
  explanation   text,
  is_active     boolean not null default true,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index questions_subject_active_idx on public.questions (subject_id) where is_active;

-- ── exam_templates ───────────────────────────────────────────────────────────
create table public.exam_templates (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  mode                  public.exam_mode not null default 'mock',
  questions_per_subject int not null default 5 check (questions_per_subject > 0),
  time_limit_minutes    int,               -- null = untimed
  pass_average          numeric not null default 75,
  min_subject_score     numeric not null default 50,
  is_published          boolean not null default false,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now()
);

-- ── exam_attempts ────────────────────────────────────────────────────────────
create table public.exam_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  template_id     uuid not null references public.exam_templates (id) on delete restrict,
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  status          public.attempt_status not null default 'in_progress',
  general_average numeric,
  passed          boolean
);
create index exam_attempts_user_idx on public.exam_attempts (user_id, started_at desc);

-- ── attempt_questions ────────────────────────────────────────────────────────
create table public.attempt_questions (
  id             uuid primary key default gen_random_uuid(),
  attempt_id     uuid not null references public.exam_attempts (id) on delete cascade,
  question_id    uuid not null references public.questions (id) on delete restrict,
  subject_id     uuid not null references public.subjects (id) on delete restrict,
  position       int not null,
  selected_label text,
  is_correct     boolean
);
create index attempt_questions_attempt_idx on public.attempt_questions (attempt_id, position);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.profiles          enable row level security;
alter table public.subjects          enable row level security;
alter table public.questions         enable row level security;
alter table public.exam_templates    enable row level security;
alter table public.exam_attempts     enable row level security;
alter table public.attempt_questions enable row level security;

-- profiles: read own or any (admin); update own (full_name).
create policy "profiles read own" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- subjects: any authenticated user reads; only admins write.
create policy "subjects read" on public.subjects
  for select using (auth.role() = 'authenticated');
create policy "subjects admin write" on public.subjects
  for all using (public.is_admin()) with check (public.is_admin());

-- questions: ADMIN ONLY (answers must never reach the browser directly;
-- exam/practice content is served via answer-stripping server actions).
create policy "questions admin all" on public.questions
  for all using (public.is_admin()) with check (public.is_admin());

-- exam_templates: students read published; admins do everything.
create policy "templates read published" on public.exam_templates
  for select using (is_published or public.is_admin());
create policy "templates admin write" on public.exam_templates
  for all using (public.is_admin()) with check (public.is_admin());

-- exam_attempts: owner full access; admins read.
create policy "attempts owner select" on public.exam_attempts
  for select using (user_id = auth.uid() or public.is_admin());
create policy "attempts owner insert" on public.exam_attempts
  for insert with check (user_id = auth.uid());
create policy "attempts owner update" on public.exam_attempts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- attempt_questions: accessible only through ownership of the parent attempt.
create policy "attempt_questions owner select" on public.attempt_questions
  for select using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id and (a.user_id = auth.uid() or public.is_admin())
    )
  );
create policy "attempt_questions owner update" on public.attempt_questions
  for update using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id and a.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id and a.user_id = auth.uid()
    )
  );
