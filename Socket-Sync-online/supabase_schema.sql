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

-- Storage Policies
create policy "Anyone can upload media" on storage.objects for insert with check ( bucket_id = 'chat-media' );
create policy "Anyone can view media" on storage.objects for select using ( bucket_id = 'chat-media' );

-- FUNCTION: Handle New User (Trigger)
-- Automatically creates a profile entry when a user signs up via Auth
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, user_id, name, avatar)
  values (new.id, new.email, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'avatar');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ENABLE REALTIME
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table contacts;
