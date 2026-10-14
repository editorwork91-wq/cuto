# CUTO — AI Creator Studio

A premium RTL-first creator workspace for turning a channel brief into a consistent content-production plan. Built with React + Vite; Supabase Auth, Postgres/RLS and Edge Functions are optional until credentials are configured.

## Current scope

- Premium dark-glass responsive studio UI.
- First-run channel onboarding: niche, audience, language/dialect, preferred voice gender, visual style, captions and channel identity.
- A database-enforced maximum of **two channels per authenticated user** (trigger + unique owner/slot constraint).
- Secure email/password auth through Supabase.
- Channel strategy / prompt-pack generation through a Supabase Edge Function using a server-side Gemini key.
- Recipe project creation and status records.
- Demo mode when Supabase isn't configured; it is explicitly local preview, not connected account storage or real video rendering.

## Local development

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local`.
3. For live auth/storage, fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from your Supabase project's Connect/API settings.
4. Run `npm install`, then `npm run dev`.

Without Supabase variables, the app opens in preview mode and saves a demo setup locally in this browser only.

## Supabase setup

1. Apply `supabase/migrations/20261014000000_cuto_core.sql` in the Supabase SQL Editor (or with the Supabase CLI).
2. Deploy the Edge Function in `supabase/functions/channel-director`.
3. Set `GEMINI_API_KEY` in Supabase Dashboard → Edge Functions → Secrets. Never place this key in browser code.
4. Ensure Email auth is enabled in Supabase Auth settings and configure your site URL / redirect URLs.

The browser uses a publishable key only. RLS policies scope rows to `auth.uid()`; channel count is enforced by Postgres as a second line of defense.

## Video generation status

The initial project creates channel strategy and recipe-production briefs. A real MP4 pipeline needs a chosen, licensed footage/video provider and a speech provider, plus a server-side rendering/worker service (for example FFmpeg). These integrations are intentionally not faked: without provider secrets and a running worker, the app does not claim that a final video exists or that a five-minute SLA is guaranteed. Use the project's stored status to report queued/running/failed/completed states from real workers.

## Production checklist

- Add production domain to Supabase Auth redirect allow-list.
- Configure email verification and password/reset email templates.
- Add rate limits and quotas for AI operations.
- Configure a real video provider and a queue/worker before advertising automatic MP4 rendering.
- Use private Storage buckets and signed URLs for generated assets.
- Run `npm run build` and validate RLS with separate test users before release.
