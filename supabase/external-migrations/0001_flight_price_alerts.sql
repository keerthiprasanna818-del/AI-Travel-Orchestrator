-- Flight price-drop alerts — full backend schema.
-- Run this in the SQL editor of the Supabase project this app uses
-- (the same project that holds public.travel_plans).
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. public.flight_price_alerts
-- ---------------------------------------------------------------------------
create table if not exists public.flight_price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  travel_plan_id uuid references public.travel_plans(id) on delete set null,
  origin text not null,
  destination text not null,
  origin_entity_id text,
  destination_entity_id text,
  departure_date date not null,
  return_date date,
  adults integer not null default 1,
  children integer not null default 0,
  cabin_class text not null default 'economy',
  currency text not null default 'INR',
  -- condition: any_drop | target_price | percent_drop
  condition_type text not null default 'any_drop',
  drop_percent numeric,
  target_price numeric,
  initial_price numeric not null,
  latest_price numeric,
  lowest_price_seen numeric,
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  status text not null default 'active',
  email_enabled boolean not null default true,
  last_notified_price numeric,
  last_notified_at timestamptz,
  notification_status text,
  in_app_unread boolean not null default false,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flight_price_alerts_status_check
    check (status in ('active', 'triggered', 'paused', 'expired')),
  constraint flight_price_alerts_condition_check
    check (condition_type in ('any_drop', 'target_price', 'percent_drop'))
);

-- One active alert per user / route / dates / travellers / cabin.
create unique index if not exists flight_price_alerts_unique_active
  on public.flight_price_alerts (
    user_id, origin, destination, departure_date,
    coalesce(return_date, '1900-01-01'::date), adults, children, cabin_class
  )
  where status in ('active', 'triggered');

create index if not exists flight_price_alerts_due_idx
  on public.flight_price_alerts (status, next_check_at);
create index if not exists flight_price_alerts_user_idx
  on public.flight_price_alerts (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. public.flight_price_history
-- ---------------------------------------------------------------------------
create table if not exists public.flight_price_history (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.flight_price_alerts(id) on delete cascade,
  checked_price numeric not null,
  currency text not null default 'INR',
  checked_at timestamptz not null default now(),
  provider text,
  result_metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists flight_price_history_alert_idx
  on public.flight_price_history (alert_id, checked_at desc);

-- ---------------------------------------------------------------------------
-- 3. public.flight_alert_notifications
-- ---------------------------------------------------------------------------
create table if not exists public.flight_alert_notifications (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.flight_price_alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Stable key for one price event; blocks duplicate emails for the same price.
  price_event_key text not null,
  recipient_email text,
  old_price numeric,
  new_price numeric,
  savings numeric,
  percent_drop numeric,
  currency text not null default 'INR',
  provider_link text,
  channel text not null default 'email',
  -- pending | sent | failed | in_app | duplicate
  status text not null default 'pending',
  error text,
  message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flight_alert_notifications_status_check
    check (status in ('pending', 'sent', 'failed', 'in_app', 'duplicate'))
);

-- Never more than one notification row per alert + price event.
create unique index if not exists flight_alert_notifications_event_unique
  on public.flight_alert_notifications (alert_id, price_event_key);
create index if not exists flight_alert_notifications_alert_idx
  on public.flight_alert_notifications (alert_id, created_at desc);
create index if not exists flight_alert_notifications_pending_idx
  on public.flight_alert_notifications (status, created_at)
  where status = 'pending';

-- Legacy name from an earlier build — carry rows over if it exists.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'flight_price_notifications'
  ) then
    insert into public.flight_alert_notifications
      (id, alert_id, user_id, price_event_key, old_price, new_price, savings,
       percent_drop, currency, provider_link, channel, status, error, created_at)
    select id, alert_id, user_id,
           'legacy-' || id::text, old_price, new_price, savings,
           percent_drop, currency, provider_link, channel,
           case when status = 'pending' then 'pending' else status end,
           error, created_at
    from public.flight_price_notifications
    on conflict do nothing;
    drop table public.flight_price_notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Grants (Data API needs these explicitly)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.flight_price_alerts to authenticated;
grant all on public.flight_price_alerts to service_role;
grant select on public.flight_price_history to authenticated;
grant all on public.flight_price_history to service_role;
grant select, update on public.flight_alert_notifications to authenticated;
grant all on public.flight_alert_notifications to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security — owners only
-- ---------------------------------------------------------------------------
alter table public.flight_price_alerts enable row level security;
alter table public.flight_price_history enable row level security;
alter table public.flight_alert_notifications enable row level security;

drop policy if exists "own alerts select" on public.flight_price_alerts;
create policy "own alerts select" on public.flight_price_alerts
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own alerts insert" on public.flight_price_alerts;
create policy "own alerts insert" on public.flight_price_alerts
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own alerts update" on public.flight_price_alerts;
create policy "own alerts update" on public.flight_price_alerts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own alerts delete" on public.flight_price_alerts;
create policy "own alerts delete" on public.flight_price_alerts
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "own history select" on public.flight_price_history;
create policy "own history select" on public.flight_price_history
  for select to authenticated using (
    exists (
      select 1 from public.flight_price_alerts a
      where a.id = flight_price_history.alert_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "own notifications select" on public.flight_alert_notifications;
create policy "own notifications select" on public.flight_alert_notifications
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own notifications update" on public.flight_alert_notifications;
create policy "own notifications update" on public.flight_alert_notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists flight_price_alerts_updated_at on public.flight_price_alerts;
create trigger flight_price_alerts_updated_at
  before update on public.flight_price_alerts
  for each row execute function public.set_updated_at();

drop trigger if exists flight_alert_notifications_updated_at on public.flight_alert_notifications;
create trigger flight_alert_notifications_updated_at
  before update on public.flight_alert_notifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Scheduler (run once, after the app is published)
-- ---------------------------------------------------------------------------
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'check-flight-price-alerts',
--   '0 */2 * * *',
--   $$
--   select net.http_post(
--     url := 'https://travel-agent-collective.lovable.app/api/public/hooks/check-flight-price-alerts',
--     headers := '{"Content-Type": "application/json", "apikey": "<APP_SUPABASE_ANON_KEY>"}'::jsonb,
--     body := '{}'::jsonb
--   ) as request_id;
--   $$
-- );
--
-- select cron.schedule(
--   'send-flight-price-alert-email',
--   '15 */2 * * *',
--   $$
--   select net.http_post(
--     url := 'https://travel-agent-collective.lovable.app/api/public/hooks/send-flight-price-alert-email',
--     headers := '{"Content-Type": "application/json", "apikey": "<APP_SUPABASE_ANON_KEY>"}'::jsonb,
--     body := '{}'::jsonb
--   ) as request_id;
--   $$
-- );
-- The checker only picks alerts whose next_check_at has passed, so this cron
-- cadence never checks an alert more often than its configured interval
-- (24h > 30 days out, 12h for 8-30 days, 6h within 7 days).
