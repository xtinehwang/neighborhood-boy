create extension if not exists "pgcrypto";

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  name text,
  address text,
  description text,
  created_at timestamptz not null default now()
);