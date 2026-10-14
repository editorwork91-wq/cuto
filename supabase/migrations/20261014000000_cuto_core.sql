-- CUTO core schema. Apply once in Supabase SQL Editor or through Supabase CLI.
create extension if not exists pgcrypto;

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  name text not null check (char_length(trim(name)) between 1 and 70),
  username text not null check (char_length(trim(username)) between 2 and 30),
  niche text not null check (char_length(trim(niche)) between 1 and 700),
  audience text not null default '',
  language text not null default 'ar-EG' check (language in ('ar-EG', 'ar', 'en', 'tr')),
  voice_gender text not null default 'female' check (voice_gender in ('female', 'male')),
  visual_style text not null default 'سينمائي واقعي',
  captions_enabled boolean not null default true,
  watermark_enabled boolean not null default true,
  channel_strategy jsonb not null default '{}'::jsonb,
  prompt_pack jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channels_one_slot_per_user unique (user_id, slot)
);

-- The only available slots are 1 and 2, and each slot can be used once per owner:
-- a user cannot create a third channel, including via simultaneous direct API requests.
create unique index if not exists channels_username_per_user_lower_idx
  on public.channels (user_id, lower(username));

create table if not exists public.video_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 180),
  idea text not null check (char_length(trim(idea)) between 1 and 1800),
  status text not null default 'draft'
    check (status in ('draft', 'planning', 'queued', 'processing', 'completed', 'failed')),
  progress smallint not null default 0 check (progress between 0 and 100),
  stage text not null default 'مسودة محفوظة',
  aspect_ratio text not null default '9:16' check (aspect_ratio = '9:16'),
  duration_seconds smallint not null default 45 check (duration_seconds between 15 and 180),
  recipe_plan jsonb not null default '{}'::jsonb,
  prompt_pack jsonb not null default '{}'::jsonb,
  thumbnail_url text,
  video_url text,
  voice_storage_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_channel_owner_consistency unique (id, user_id)
);

alter table public.video_projects add column if not exists voice_storage_path text;

create index if not exists channels_user_created_idx on public.channels (user_id, created_at desc);
create index if not exists projects_user_created_idx on public.video_projects (user_id, created_at desc);
create index if not exists projects_channel_created_idx on public.video_projects (channel_id, created_at desc);

create or replace function public.cuto_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists channels_set_updated_at on public.channels;
create trigger channels_set_updated_at
before update on public.channels
for each row execute function public.cuto_set_updated_at();

drop trigger if exists video_projects_set_updated_at on public.video_projects;
create trigger video_projects_set_updated_at
before update on public.video_projects
for each row execute function public.cuto_set_updated_at();

alter table public.channels enable row level security;
alter table public.video_projects enable row level security;

drop policy if exists "Users can view their own channels" on public.channels;
create policy "Users can view their own channels"
  on public.channels for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create up to two owned channels" on public.channels;
create policy "Users can create up to two owned channels"
  on public.channels for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own channels" on public.channels;
create policy "Users can update their own channels"
  on public.channels for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own channels" on public.channels;
create policy "Users can delete their own channels"
  on public.channels for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own projects" on public.video_projects;
create policy "Users can view their own projects"
  on public.video_projects for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.channels c
      where c.id = video_projects.channel_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can create projects for their own channels" on public.video_projects;
create policy "Users can create projects for their own channels"
  on public.video_projects for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.channels c
      where c.id = video_projects.channel_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can update their own projects" on public.video_projects;
create policy "Users can update their own projects"
  on public.video_projects for update to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.channels c
      where c.id = video_projects.channel_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.channels c
      where c.id = video_projects.channel_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete their own projects" on public.video_projects;
create policy "Users can delete their own projects"
  on public.video_projects for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Private assets bucket. Object names should start with <auth.uid()>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cuto-assets',
  'cuto-assets',
  false,
  52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','audio/mpeg','audio/wav','audio/mp4']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their private CUTO assets" on storage.objects;
create policy "Users can read their private CUTO assets"
  on storage.objects for select to authenticated
  using (bucket_id = 'cuto-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can upload their private CUTO assets" on storage.objects;
create policy "Users can upload their private CUTO assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cuto-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can update their private CUTO assets" on storage.objects;
create policy "Users can update their private CUTO assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'cuto-assets' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'cuto-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can delete their private CUTO assets" on storage.objects;
create policy "Users can delete their private CUTO assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cuto-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.channels to authenticated;
grant select, insert, update, delete on public.video_projects to authenticated;

-- Enable realtime project status updates where the default Supabase publication is available.
do $$
begin
  alter publication supabase_realtime add table public.video_projects;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
