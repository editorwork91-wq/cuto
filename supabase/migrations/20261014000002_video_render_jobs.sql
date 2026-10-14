-- Durable job state for the AI-only Veo -> RenderScript -> private Supabase Storage pipeline.
-- All provider calls and job writes are performed by authenticated Edge Functions using the service role.
alter table public.video_projects
  add column if not exists video_storage_path text;

create table if not exists public.video_render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'generating_scenes', 'rendering', 'uploading', 'completed', 'failed')),
  progress smallint not null default 0 check (progress between 0 and 100),
  stage text not null default 'في قائمة انتظار الإنتاج',
  scenes jsonb not null default '[]'::jsonb,
  render_provider_id text,
  output_storage_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_render_jobs_project_unique unique (project_id),
  constraint video_render_jobs_owner_consistency foreign key (project_id, user_id)
    references public.video_projects(id, user_id) on delete cascade
);

create index if not exists video_render_jobs_user_created_idx
  on public.video_render_jobs (user_id, created_at desc);
create index if not exists video_render_jobs_status_updated_idx
  on public.video_render_jobs (status, updated_at);

drop trigger if exists video_render_jobs_set_updated_at on public.video_render_jobs;
create trigger video_render_jobs_set_updated_at
before update on public.video_render_jobs
for each row execute function public.cuto_set_updated_at();

alter table public.video_render_jobs enable row level security;

drop policy if exists "Users can view their own video render jobs" on public.video_render_jobs;
create policy "Users can view their own video render jobs"
  on public.video_render_jobs for select to authenticated
  using ((select auth.uid()) = user_id);

-- Intentionally do not grant authenticated insert/update/delete policies. The app cannot forge
-- provider operation names, progress, output URLs, or completion; trusted Edge Functions own writes.
grant select on public.video_render_jobs to authenticated;
revoke insert, update, delete on public.video_render_jobs from authenticated;
