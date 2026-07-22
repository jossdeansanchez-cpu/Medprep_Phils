-- Soft-delete marker so a question used in past attempts (which can't be hard-
-- deleted due to the attempt_questions FK) can still be removed from the admin
-- Question Bank view while its row stays for historical attempt reviews.
-- Distinct from is_active: a "Deactivated" question still shows in the bank (so
-- it can be reactivated); a "Deleted" one (deleted_at set) does not.
alter table public.questions
  add column if not exists deleted_at timestamptz;
