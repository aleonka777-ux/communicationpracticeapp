-- Row Level Security policies for all tables.

create or replace function public.is_coach()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'coach'
  );
$$;

-- profiles ------------------------------------------------------------
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- Note: role changes are intentionally not allowed via this policy (with check pins role to its
-- current value), preventing self-service escalation to 'coach'. Promote coaches via the Supabase
-- dashboard or a service-role script.

-- communication_tools ---------------------------------------------------
create policy "tools_select_active_or_coach" on public.communication_tools
  for select using (active = true or public.is_coach());

create policy "tools_insert_coach" on public.communication_tools
  for insert with check (public.is_coach());

create policy "tools_update_coach" on public.communication_tools
  for update using (public.is_coach()) with check (public.is_coach());

create policy "tools_delete_coach" on public.communication_tools
  for delete using (public.is_coach());

-- scenarios ---------------------------------------------------------
create policy "scenarios_select_active_or_coach" on public.scenarios
  for select using (active = true or public.is_coach());

create policy "scenarios_insert_coach" on public.scenarios
  for insert with check (public.is_coach());

create policy "scenarios_update_coach" on public.scenarios
  for update using (public.is_coach()) with check (public.is_coach());

create policy "scenarios_delete_coach" on public.scenarios
  for delete using (public.is_coach());

-- practice_sessions ---------------------------------------------------
create policy "sessions_select_own" on public.practice_sessions
  for select using (user_id = auth.uid());

create policy "sessions_insert_own" on public.practice_sessions
  for insert with check (user_id = auth.uid());

create policy "sessions_update_own" on public.practice_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "sessions_delete_own" on public.practice_sessions
  for delete using (user_id = auth.uid());

-- conversation_messages -----------------------------------------------
create policy "messages_select_own" on public.conversation_messages
  for select using (
    exists (
      select 1 from public.practice_sessions s
      where s.id = conversation_messages.session_id and s.user_id = auth.uid()
    )
  );

create policy "messages_insert_own" on public.conversation_messages
  for insert with check (
    exists (
      select 1 from public.practice_sessions s
      where s.id = conversation_messages.session_id and s.user_id = auth.uid()
    )
  );

-- evaluations -----------------------------------------------------------
create policy "evaluations_select_own" on public.evaluations
  for select using (
    exists (
      select 1 from public.practice_sessions s
      where s.id = evaluations.session_id and s.user_id = auth.uid()
    )
  );

create policy "evaluations_insert_own" on public.evaluations
  for insert with check (
    exists (
      select 1 from public.practice_sessions s
      where s.id = evaluations.session_id and s.user_id = auth.uid()
    )
  );
