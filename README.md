# KIKKO

A mobile-first daily social mini-game. One 30-second official game a day, the same for everyone. Compete with the world solo, add private friend groups if you want, and practice in the Arcade.

**Stack:** React 18, TypeScript, Vite, Motion (`motion/react`), Supabase (Auth, Postgres + RLS, Edge Functions). Installable PWA.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build to dist/
npm run test:engine  # sanity checks for the shared game engine (Node 22+)
```

With no environment variables, KIKKO runs in **Demo mode**: fully playable, but the player, scores and groups stay in this browser's localStorage, scores aren't server-verified, and the World board shows **sample players clearly labelled "Example data"**. The UI says it's in Demo mode on every screen where that matters.

## Go online (Supabase)

1. Create a Supabase project and install the CLI.
2. `supabase link --project-ref <ref>`
3. `supabase db push` applies `supabase/migrations/20261113000000_kikko_core.sql`.
4. `supabase functions deploy daily`. The function uses the auto-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side only. Optionally set `ALLOWED_ORIGIN` to your site's origin.
5. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the public anon key, **never** the service role key).
6. Auth: email one-time codes work once the Email provider is on. In the "Magic Link" email template, include `{{ .Token }}` so users get the 6-digit code. For Apple / Google, enable them in Supabase Auth, add your site URL to the redirect allow-list, then set `VITE_AUTH_PROVIDERS=apple,google`. Buttons only appear for providers listed there.

Deploy `dist/` to any static host (Netlify, Vercel, Cloudflare Pages). Serve it over HTTPS so the PWA installs.

## How fairness works

- **One official attempt per account per day** is enforced by a DB unique constraint `(user_id, challenge_id)`.
- The attempt is created by the `daily` edge function only when the player presses **I'm ready**, with a **server timestamp**. Opening the prep screen doesn't use it.
- The day's seed lives in `challenge_secrets` (no client access) and is sent only once the attempt has started.
- The client submits its **tap log**, not a score. The server replays it with the exact same engine (`supabase/functions/_shared/oddspot.ts`, shared by browser and server), recomputes the score, and rejects: out-of-order taps, taps past 30 s, late submissions (more than 10 s grace), clock mismatches and duplicate submits. Inhumanly fast taps (<120 ms) are ignored.
- Rate limits cover starting, submitting and joining groups. RLS: users read only their own attempts; leaderboards go through `security definer` RPCs; attempts are written only by the service role.
- If the app reloads mid-game, the attempt resumes on the server clock with the taps already made.

**Known limitations:** one attempt per *account* can't stop one person from making several accounts. Any client-rendered game can in principle be botted after the seed is revealed. Server checks raise the bar but don't make cheating impossible. Ranks are computed live and labelled *provisional* until 00:00 UTC.

## Scoring

+100 per find. Speed bonus up to +50 (full under 0.8 s, zero at 3.8 s). −40 per wrong tap plus a 0.45 s freeze; the score never drops below 0. **Tie-break:** score, then more finds, then fewer wrong taps, then earlier submission.

## Structure

```
src/app            navigation stack, session & today state
src/backend        Backend interface: demo.ts (local) / online.ts (Supabase)
src/components     design system: Key (tactile button), Icon, Avatar, Sheet, TabBar, Glyph, Motifs…
src/illustrations  animated SVG/CSS illustrations (hero stage, onboarding scenes)
src/features       screens: Welcome, Onboarding, Auth, Home, Prep, Play, Results, World, Friends, Group, Join, Arcade, Profile
src/styles         tokens + component + screen CSS
supabase/          migration, edge function, shared engine
brand-src/         original logo files + extract.py (transparent cutouts, reversed wordmark)
```

## Brand notes

The official logo is used unmodified. `public/brand/kikko-logo-reversed.png` is the same logo with only the wordmark recoloured to cream, for blue backgrounds. Delete it if you'd rather not use a reversed version. Palette: electric blue `#3777F6` (primary), cream `#FFF8E9`, coral `#FF8C60` and lime `#C9FF67` (accents), charcoal `#29232A`. Type: Outfit (display) + Plus Jakarta Sans (UI), self-hosted so they work offline.
