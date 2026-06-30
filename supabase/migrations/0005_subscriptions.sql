-- Subscriptions, entitlements, and feature gating for monetization.

create type plan_tier as enum ('free','basic','pro','max_pro');
create type billing_interval as enum ('month','year');

create table public.subscriptions (
  user_id                uuid primary key references public.profiles(id) on delete cascade,
  plan                   plan_tier not null default 'free',
  status                 text not null default 'inactive',
  interval               billing_interval,
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);
create index subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

create table public.practice_daily (
  user_id  uuid references public.profiles(id) on delete cascade,
  day      date not null default (now() at time zone 'utc')::date,
  answered int not null default 0,
  primary key (user_id, day)
);

alter table public.subscriptions  enable row level security;
alter table public.practice_daily enable row level security;

-- Users read only their own subscription; admins read all. No client writes:
-- writes happen via the service-role webhook or the admin RPC.
create policy "subs read own" on public.subscriptions
  for select using (user_id = auth.uid() or public.is_admin());

-- ── Entitlement helpers ───────────────────────────────────────────────────────
create or replace function public.plan_rank(p plan_tier)
returns int language sql immutable as $$
  select case p when 'free' then 0 when 'basic' then 1 when 'pro' then 2 when 'max_pro' then 3 end;
$$;

create or replace function public.effective_plan()
returns plan_tier language sql stable security definer set search_path = public as $$
  select case when s.status in ('active','trialing') then s.plan else 'free'::plan_tier end
  from (select auth.uid() as uid) me
  left join public.subscriptions s on s.user_id = me.uid;
$$;

create or replace function public.current_entitlements()
returns table (plan plan_tier, status text, entitled boolean, current_period_end timestamptz)
language sql stable security definer set search_path = public as $$
  select
    case when s.status in ('active','trialing') then coalesce(s.plan,'free'::plan_tier)
         else 'free'::plan_tier end,
    coalesce(s.status, 'inactive'),
    coalesce(s.status in ('active','trialing'), false),
    s.current_period_end
  from (select auth.uid() as uid) me
  left join public.subscriptions s on s.user_id = me.uid;
$$;

-- Admin: comp a plan with no Stripe involvement.
create or replace function public.admin_set_plan(
  p_user_id uuid, p_plan plan_tier, p_interval billing_interval default 'month'
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  insert into public.subscriptions (user_id, plan, status, interval, current_period_end, updated_at)
  values (p_user_id, p_plan,
          case when p_plan = 'free' then 'inactive' else 'active' end,
          p_interval, now() + interval '100 years', now())
  on conflict (user_id) do update
    set plan = excluded.plan, status = excluded.status, interval = excluded.interval,
        current_period_end = excluded.current_period_end, updated_at = now();
end;
$$;

-- ── start_attempt: re-created with a Pro+ gate for mock exams ──────────────────
create or replace function public.start_attempt(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_attempt   uuid;
  v_qps       int;
  v_published boolean;
  v_mode      public.exam_mode;
  v_count     int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select questions_per_subject, is_published, mode
    into v_qps, v_published, v_mode
  from public.exam_templates
  where id = p_template_id;

  if v_qps is null then
    raise exception 'Template not found';
  end if;
  if not v_published and not public.is_admin() then
    raise exception 'Template not available';
  end if;

  -- Mock exams require Pro or higher.
  if v_mode = 'mock'
     and public.plan_rank(public.effective_plan()) < public.plan_rank('pro') then
    raise exception 'Upgrade to Pro to take mock exams';
  end if;

  insert into public.exam_attempts (user_id, template_id)
  values (v_uid, p_template_id)
  returning id into v_attempt;

  insert into public.attempt_questions (attempt_id, question_id, subject_id, position)
  select v_attempt, picked.id, picked.subject_id,
         row_number() over (order by picked.sort_order, random())
  from (
    select q.id, q.subject_id, s."order" as sort_order,
           row_number() over (partition by q.subject_id order by random()) as rn
    from public.questions q
    join public.subjects s on s.id = q.subject_id
    where q.is_active
  ) picked
  where picked.rn <= v_qps;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'No active questions available to build an exam';
  end if;

  return v_attempt;
end;
$$;

-- ── save_answer: re-created with the free-tier daily cap ───────────────────────
create or replace function public.save_answer(
  p_attempt_question_id uuid,
  p_selected text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_mode    public.exam_mode;
  v_status  public.attempt_status;
  v_correct text;
  v_expl    text;
  v_is_correct boolean;
  v_today   date := (now() at time zone 'utc')::date;
  v_answered int;
begin
  select t.mode, a.status, q.correct_label, q.explanation
    into v_mode, v_status, v_correct, v_expl
  from public.attempt_questions aq
  join public.exam_attempts a on a.id = aq.attempt_id
  join public.exam_templates t on t.id = a.template_id
  join public.questions q on q.id = aq.question_id
  where aq.id = p_attempt_question_id
    and a.user_id = v_uid;

  if v_status is null then
    raise exception 'Question not found';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'Attempt already submitted';
  end if;

  -- Free tier: cap study-mode answers at 10 per UTC day.
  if v_mode = 'practice' and public.effective_plan() = 'free' then
    insert into public.practice_daily (user_id, day, answered)
    values (v_uid, v_today, 1)
    on conflict (user_id, day) do update set answered = public.practice_daily.answered + 1
    returning answered into v_answered;
    if v_answered > 10 then
      raise exception 'Daily free limit reached. Upgrade to keep practicing.';
    end if;
  end if;

  v_is_correct := (p_selected = v_correct);

  update public.attempt_questions
  set selected_label = p_selected,
      is_correct = case when v_mode = 'practice' then v_is_correct else is_correct end
  where id = p_attempt_question_id;

  if v_mode = 'practice' then
    return jsonb_build_object(
      'revealed', true,
      'is_correct', v_is_correct,
      'correct_label', v_correct,
      'explanation', v_expl
    );
  end if;

  return jsonb_build_object('revealed', false);
end;
$$;
