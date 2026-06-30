# MEDprep — PRC Physician Licensure Exam practice

A web app for medical students preparing for the Philippine **Physician Licensure
Examination (PLE)**. Admins upload a question bank (CSV/Excel); the app automatically
assembles randomized exams across the **12 PLE subjects**, with both a **timed mock exam**
and an **untimed study mode**, scored using the real PLE pass rule.

Built with **Next.js (App Router)** + **Supabase** (Postgres, Auth, RLS).

## Features

- **Admin question bank** — bulk upload via CSV/Excel with row-level validation and a
  preview-before-commit step. Browse, deactivate, and delete questions per subject.
- **Exam templates** — admins create timed mock or untimed practice sets (questions per
  subject, time limit, pass thresholds) and publish them.
- **Mock exam** — randomized questions per subject, countdown timer, auto-submit on
  timeout, answers never sent to the browser until submission.
- **Study mode** — untimed; reveals the correct answer and rationale immediately.
- **PLE-style scoring** — per-subject percentages, general average, and the pass rule:
  **average ≥ 75% AND no subject below 50%**.
- **Results** — pass/fail, per-subject breakdown, and a full review with explanations.

## Architecture

- Exam content and grading run through **SECURITY DEFINER Postgres functions**
  (`start_attempt`, `get_attempt_questions`, `save_answer`, `submit_attempt`,
  `get_attempt_review`). This lets the server read the answer-bearing `questions` table on
  a student's behalf **without ever exposing correct answers** — the `questions` table is
  admin-only under RLS. No service-role key is needed in the app.
- Roles (`student` / `admin`) live in `profiles`; the **first account created becomes the
  admin** (via a signup trigger). `proxy.ts` refreshes the session and guards `/admin/*`.

Migrations are in [`supabase/migrations/`](supabase/migrations/).

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` (see `.env.local.example`) with your Supabase project URL and
   anon/publishable key:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
3. Apply the migrations in `supabase/migrations/` to your Supabase project (Supabase SQL
   editor, the CLI, or the dashboard), in order.
4. Run the dev server:
   ```bash
   npm run dev
   ```

### Auth note
New Supabase projects have **email confirmation ON** by default. For students to sign up
without an email round-trip, either configure SMTP or disable confirmation in
**Supabase Dashboard → Authentication → Providers → Email → "Confirm email"**.

## Question upload format

CSV/Excel columns (header row required, case-insensitive):

| column | required | notes |
|---|---|---|
| `subject` | yes | must match a PLE subject, e.g. `Anatomy`, `Medicine` |
| `stem` | yes | the question text |
| `option_a`…`option_d` | a, b required | answer choices |
| `option_e` | no | optional 5th choice |
| `correct` | yes | one of `A`–`E`, must match a provided option |
| `explanation` | no | shown in study mode and on the results review |

A downloadable template is available on the **Admin → Upload** page.

## Project layout

```
src/
  app/
    page.tsx                 landing
    login/  signup/          auth pages
    dashboard/               student home + history
    practice/                study-mode set picker
    exam/[id]/               unified exam runner (mock + practice)
    results/[id]/            score breakdown + review
    admin/                   overview, upload, questions, exams
    auth/actions.ts          sign in/up/out server actions
  components/                Nav, AuthForm, ExamRunner
  lib/
    supabase/                browser/server clients + session proxy helper
    auth.ts                  getCurrentProfile / requireAdmin
    csv.ts                   upload parsing + validation
    exam.ts                  exam RPC server actions
    types.ts                 shared types
supabase/migrations/         schema, seed, exam functions
```
