-- Add a per-channel default video duration without changing existing channel data.
alter table public.channels
  add column if not exists default_duration_seconds smallint not null default 45;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'channels_default_duration_seconds_check'
      and conrelid = 'public.channels'::regclass
  ) then
    alter table public.channels
      add constraint channels_default_duration_seconds_check
      check (default_duration_seconds in (30, 45, 60));
  end if;
end;
$$;
