-- Create orders table if not exists (App.tsx depends on this)
create table if not exists orders (
  id uuid default gen_random_uuid() primary key,
  order_name text not null,
  sender_name text not null,
  pharmacy text not null,
  image_urls text[] default array[]::text[],
  note text,
  status text default 'pending',
  has_recorded_entry boolean default false,
  has_recorded_batch_info boolean default false,
  scan_mode text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  completed_at timestamp with time zone
);

-- Create notifications table
create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  body text not null,
  read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create activity_logs table
create table if not exists activity_logs (
  id uuid default gen_random_uuid() primary key,
  user_name text not null,
  action text not null,
  details text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table orders enable row level security;
alter table notifications enable row level security;
alter table activity_logs enable row level security;

-- Create policies
create policy "Enable all access for everyone" on orders for all using (true);
create policy "Enable all access for everyone" on notifications for all using (true);
create policy "Enable all access for everyone" on activity_logs for all using (true);

-- Enable Realtime (Ignore error if already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'activity_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Skipping publication add: %', SQLERRM;
END $$;
