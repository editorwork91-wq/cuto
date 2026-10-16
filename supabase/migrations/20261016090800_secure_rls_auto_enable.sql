-- Keep the event trigger active for automatic RLS on future public tables,
-- but prevent direct invocation of its SECURITY DEFINER function through exposed API roles.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
