-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES (Users)
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  user_id text unique, -- This will store the EMAIL to match existing logic
  name text,
  avatar text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_login timestamp with time zone,
  login_streak int default 0,
  qr_token text
);

-- RLS for Profiles
alter table profiles enable row level security;
create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);
create policy "Users can delete own profile." on profiles for delete using (auth.uid() = id);

-- CONTACTS
create table contacts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  contact_id uuid references profiles(id) on delete cascade not null,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, contact_id)
);

-- RLS for Contacts
alter table contacts enable row level security;
create policy "Users can view their own contacts." on contacts for select using (auth.uid() = user_id);
create policy "Users can add contacts." on contacts for insert with check (auth.uid() = user_id);
create policy "Users can delete contacts." on contacts for delete using (auth.uid() = user_id);

-- MESSAGES
create table messages (
  id uuid default uuid_generate_v4() primary key,
  sender uuid references profiles(id) on delete cascade not null,
  receiver uuid references profiles(id) on delete cascade not null,
  message text,
  file_url text,
  file_type text,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  status text default 'sent', -- sent, delivered, read
  is_revoked boolean default false,
  deleted_by_sender boolean default false,
  deleted_by_receiver boolean default false
);

-- RLS for Messages
alter table messages enable row level security;
create policy "Users can see messages sent to or by them." on messages for select using (auth.uid() = sender or auth.uid() = receiver);
create policy "Users can insert messages." on messages for insert with check (auth.uid() = sender);
create policy "Users can update messages involving them (read status/delete)." on messages for update using (auth.uid() = sender or auth.uid() = receiver);

-- STORAGE (Buckets)
insert into storage.buckets (id, name, public) values ('chat-media', 'chat-media', true);

-- TRIGGER: Delete Auth User when Profile is deleted
-- This ensures that when a user deletes their account from the UI (which deletes the profile),
-- they are also removed from Supabase Auth so they can't login again.
create or replace function public.delete_user()
returns trigger as $$
begin
  delete from auth.users where id = old.id;
  return old;
end;
$$ language plpgsql security definer;

create trigger on_profile_delete
  after delete on public.profiles
  for each row execute procedure public.delete_user();
