-- Cover foreign-key checks and cascades for render jobs as project volume grows.
create index if not exists video_render_jobs_channel_id_idx
  on public.video_render_jobs (channel_id);

create index if not exists video_render_jobs_project_user_idx
  on public.video_render_jobs (project_id, user_id);
