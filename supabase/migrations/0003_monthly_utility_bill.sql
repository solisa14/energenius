alter table public.profiles
  add column if not exists monthly_utility_bill_usd numeric(10, 2);
