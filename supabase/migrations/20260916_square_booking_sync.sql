alter table public.jobs
  add column if not exists square_booking_id text unique,
  add column if not exists square_customer_id text,
  add column if not exists square_location_id text,
  add column if not exists square_team_member_id text,
  add column if not exists square_status text,
  add column if not exists square_synced_at timestamptz,
  add column if not exists booking_source text not null default 'manual';

create index if not exists jobs_square_booking_id_idx
  on public.jobs(square_booking_id)
  where square_booking_id is not null;

create table if not exists public.square_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table public.square_webhook_events enable row level security;

-- Only server-side functions should write webhook audit records.
revoke all on public.square_webhook_events from anon, authenticated;
