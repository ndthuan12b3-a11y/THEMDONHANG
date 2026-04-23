-- Create medx_invoices table
create table if not exists medx_invoices (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  date date not null,
  link text,
  note text,
  pharmacy text not null,
  completed boolean default false,
  is_deleted boolean default false,
  ever_blacklisted boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  deleted_at timestamp with time zone
);

-- Enable RLS
alter table medx_invoices enable row level security;

-- Create policies (Public for now as requested or implied by the legacy setup)
create policy "Enable all access for everyone" on medx_invoices for all using (true);

-- Enable Realtime
alter publication supabase_realtime add table medx_invoices;
