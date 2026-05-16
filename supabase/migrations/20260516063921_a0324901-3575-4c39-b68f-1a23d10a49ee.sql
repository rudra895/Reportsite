
-- Employees
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  code text unique,                -- their own broker code (nullable)
  name text not null,
  is_default boolean not null default false,  -- catch-all (Ganpat)
  created_at timestamptz not null default now()
);

-- Sub-brokers / APs
create table public.sub_brokers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text,
  tag text,                         -- AP / SUB derived from code suffix
  employee_id uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Daily brokerage rows from Excel
create table public.daily_brokerage (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  code text not null,
  name text,
  gross numeric not null default 0,
  share numeric not null default 0,
  net numeric not null default 0,
  created_at timestamptz not null default now(),
  unique(date, code)
);
create index on public.daily_brokerage(date);
create index on public.daily_brokerage(code);

-- Per-day upload tracking
create table public.daily_uploads (
  date date primary key,
  filename text,
  row_count int not null default 0,
  uploaded_at timestamptz not null default now()
);

-- Calendar holidays / notes
create table public.calendar_days (
  date date primary key,
  is_holiday boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.employees enable row level security;
alter table public.sub_brokers enable row level security;
alter table public.daily_brokerage enable row level security;
alter table public.daily_uploads enable row level security;
alter table public.calendar_days enable row level security;

create policy "auth all employees" on public.employees for all to authenticated using (true) with check (true);
create policy "auth all sub_brokers" on public.sub_brokers for all to authenticated using (true) with check (true);
create policy "auth all daily_brokerage" on public.daily_brokerage for all to authenticated using (true) with check (true);
create policy "auth all daily_uploads" on public.daily_uploads for all to authenticated using (true) with check (true);
create policy "auth all calendar_days" on public.calendar_days for all to authenticated using (true) with check (true);
