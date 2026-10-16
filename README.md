# CUTO — AI Creator Studio

A premium RTL-first creator workspace for turning a channel brief into a consistent content-production plan. Built with React + Vite; Supabase Auth, Postgres/RLS and Edge Functions are optional until credentials are configured.

## Current scope

- Premium dark-glass responsive studio UI.
- First-run channel onboarding: niche, audience, language/dialect, preferred voice gender, visual style, captions and channel identity.
- A database-enforced maximum of **two channels per authenticated user** (trigger + unique owner/slot constraint).
- Secure email/password auth through Supabase.
- Channel strategy / prompt-pack generation through a Supabase Edge Function using a server-side Gemini key.
- Recipe project creation, publishing-caption packages, and persisted render-job status.
- AI-only video pipeline in progress: Gemini plans each project, Gemini TTS provides the narration, Modal runs LTX-2.5 on GPU to generate clips, and FFmpeg composes the final portrait MP4 with subtitles and channel identity.
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

1. Apply all migrations in `supabase/migrations/` in filename order to the dedicated CUTO Supabase project. Do not apply them to YOMY.
2. Deploy `channel-director`, `recipe-director`, `voice-preview`, `generate-narration`, `modal-render-start`, and `modal-render-status`. Keep JWT verification enabled.
3. Set `GEMINI_API_KEY` in Supabase Dashboard → Edge Functions → Secrets. Optionally set `GEMINI_MODEL` and `GEMINI_TTS_MODEL` to override defaults. Never put these secrets in the browser or commit their real values.
4. Before deploying, accept LTX-2.5's gated license on Hugging Face and create a read token (`HF_TOKEN`). In Modal, create a Secret named `cuto-supabase-worker` with `SUPABASE_URL`, the server-only `SUPABASE_SECRET_KEY` for CUTO, and `HF_TOKEN`.
5. In GitHub repository Settings → Secrets and variables → Actions, add `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` using a Modal API token (deployment credentials, typically `ak-` / `as-`; these are not proxy tokens).
6. After this branch is merged into `main`, run Actions → Deploy CUTO Modal Video Worker → Run workflow. This uses GitHub's hosted runner to deploy the Modal GPU worker; you do not need an always-on server or local Python installation.
7. In Modal, create a separate Proxy Auth Token for the deployed `submit_video` endpoint. In Supabase Edge Function Secrets, set `MODAL_VIDEO_ENDPOINT_URL`, `MODAL_KEY`, and `MODAL_SECRET` from the deployed endpoint and proxy token (`wk-` / `ws-`). Keep all these out of `VITE_` variables and frontend files.
9. Ensure Email auth is enabled and configure your site URL / redirect URLs. Run a full test from recipe planning through a private MP4 download before advertising production readiness.
8. The narration function generates a WAV and stores it in private `cuto-assets`; the final Modal worker generates original video scenes with LTX-2.5 and composes them using FFmpeg. Voice gender is a preference/instruction to TTS, not a guarantee of a specific speaker identity or dialect quality.

The browser uses a publishable key only. RLS policies scope rows to `auth.uid()`; channel count is enforced by Postgres as a second line of defense.

## Video generation status

CUTO's intended full pipeline is Gemini for planning/captions, Gemini TTS from Google AI Studio for narration, and Modal hosting LTX-2.5-Diffusers on GPU to generate the visual clips from scratch. FFmpeg on the Modal worker combines AI-generated clips, narration, subtitles, hook text, and channel identity into portrait MP4. Supabase holds private job state and generated assets.

The deployment still requires a dedicated CUTO Supabase project, applied migrations, published Edge Functions, Modal CLI deployment, server-only secrets, model license review, and real end-to-end acceptance tests. Provider setup in documentation is not proof that external services have already been deployed or that MP4 output has been production-tested.

The pipeline does not use stock footage or unrelated generic nature clips. A five-minute turnaround remains a performance goal, not a guarantee.

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
