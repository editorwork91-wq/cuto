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

## Keys and provider setup

Read the Arabic step-by-step guide: [`docs/KEYS_SETUP_AR.md`](docs/KEYS_SETUP_AR.md). It explains where to get Supabase and Gemini credentials, where to store server secrets, and which integrations are still required for actual MP4 output.

## Local development

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local`.
3. For live auth/storage, fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from your Supabase project's Connect/API settings.
4. Run `npm install`, then `npm run dev`.

Without Supabase variables, the app opens in preview mode and saves a demo setup locally in this browser only.

## Publish a preview on GitHub Pages

The GitHub token connected to this session cannot enable Pages for the repository. To publish the preview, open **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source, then run **Actions → Deploy CUTO preview to GitHub Pages → Run workflow**. The Pages workflow is manual so it will not repeatedly fail while Pages remains disabled. Without repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, it publishes the local-preview experience; configure both repository variables only after a separate CUTO Supabase project is ready.

## Supabase setup

1. Apply `supabase/migrations/20261014000000_cuto_core.sql` in the Supabase SQL Editor (or with the Supabase CLI).
2. Deploy the Edge Functions from this repo: `channel-director`, `recipe-director`, `voice-preview`, and `generate-narration`. The function folders contain the entrypoint source; use the Supabase CLI from a local checkout or paste each function into the Edge Function editor. Keep JWT verification enabled.
3. Set `GEMINI_API_KEY` in Supabase Dashboard → Edge Functions → Secrets. Optionally set `GEMINI_MODEL` (default `gemini-3.8-flash`) and `GEMINI_TTS_MODEL` (default `gemini-3.8-flash-tts`) there too. Never put these secrets in the browser or commit their real values.
4. Ensure Email auth is enabled in Supabase Auth settings and configure your site URL / redirect URLs.
5. The voice preview function returns a sample generated audio clip; the narration function generates the saved script as WAV and stores it in private `cuto-assets`, then returns a short-lived signed URL. Voice gender is a preference/instruction to the model, not a guarantee of a specific speaker identity or dialect quality.

The browser uses a publishable key only. RLS policies scope rows to `auth.uid()`; channel count is enforced by Postgres as a second line of defense.

## Video generation status

The project currently creates channel strategy and recipe-production briefs, and includes Edge Functions for voice preview and saving a generated narration WAV. A real MP4 pipeline still needs a chosen, licensed footage/video provider and a server-side rendering/worker service (for example FFmpeg) to assemble clips, subtitles, the white creator handle, music and final export. These integrations are intentionally not faked: without provider secrets and a running worker, the app does not claim that a final video exists or that a five-minute SLA is guaranteed. The UI progress bar reads stored status/progress from Supabase; a production worker must update these fields truthfully.

## Production checklist

- Add production domain to Supabase Auth redirect allow-list.
- Configure email verification and password/reset email templates.
- Add rate limits and quotas for AI operations.
- Configure a real video provider and a queue/worker before advertising automatic MP4 rendering.
- Use private Storage buckets and signed URLs for generated assets.
- Run `npm run build` and validate RLS with separate test users before release.


## Channel defaults and honest task status

- Each channel stores its own default duration (30, 45, or 60 seconds); adding or switching channels applies that preference to the idea composer.
- The workspace shows stage-based progress while saving a project and requesting the AI production plan. It does not present an indeterminate planning request as a measured render percentage.
- Apply `supabase/migrations/20261014000001_channel_duration_default.sql` before deploying the per-channel duration preference.
