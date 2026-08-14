-- Conversation messages: structured transcript, one row per turn.
create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  sequence integer not null,
  speaker text not null check (speaker in ('user', 'interlocutor', 'coach_hint')),
  text text not null,
  created_at timestamptz not null default now(),
  unique (session_id, sequence)
);

comment on table public.conversation_messages is 'Structured transcript turns. coach_hint rows are Training Mode hints, excluded from the interlocutor''s own context.';

create index if not exists conversation_messages_session_id_idx on public.conversation_messages (session_id, sequence);

alter table public.conversation_messages enable row level security;
