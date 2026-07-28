-- Resources are no longer Max Pro exclusive: any paid plan (Basic, Pro,
-- Max Pro) can open the books / PDFs / review materials. Free stays excluded.
drop policy if exists "resources read max pro" on public.resources;
drop policy if exists "resources read paid" on public.resources;
create policy "resources read paid" on public.resources
  for select using (
    public.is_admin()
    or public.plan_rank(public.effective_plan()) >= public.plan_rank('basic')
  );
