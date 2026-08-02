# Vercel fix — Task Breakdown not working

## Why it broke
Your Express server (`server.ts`) was written for a traditional long-running
Node host — it ends in `app.listen(...)`. Vercel doesn't run persistent
processes for a Vite project by default, so every `/api/*` call your
frontend makes (weekly plan generation, "Break Down Further", "Forge New
Task") was hitting nothing real. Auth and reading existing trails still
worked because those go straight to Supabase from the browser, bypassing
Express entirely.

## What's in this package
Drop these files into your project at the same paths, overwriting the
originals:

```
api/index.ts              NEW  — Vercel serverless function entry point
src/server/app.ts         NEW  — all your route logic, extracted, no .listen()
server.ts                 REPLACE — now just wires app.ts into local dev
vercel.json                NEW  — routes /api/* to the serverless function
package.json               REPLACE — build script split for Vercel vs self-host
```

`src/server/app.ts` is now the single source of truth for route logic —
both local dev (`server.ts`) and Vercel (`api/index.ts`) import the same
`createApp()` function, so they can't drift out of sync.

## Steps to deploy
1. Copy these files into your repo, overwriting the four listed above.
2. Commit and push.
3. In Vercel → Project Settings → Environment Variables, confirm
   `GEMINI_API_KEY` is set. This is separate from `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` — those get baked into the client bundle at
   build time, but `GEMINI_API_KEY` is only read server-side, so it has to
   exist wherever `api/index.ts` actually executes.
4. Redeploy. No build command changes needed — Vercel auto-detects the
   Vite framework for the static build and auto-detects `api/index.ts` as
   a serverless function.

## If it still fails after this
Most likely culprit: **function timeout**. Gemini plan generation runs
multiple parallel calls with retry logic, which can be slow. Vercel Hobby
plan defaults to a 10s timeout per serverless function. If you see 504s
specifically on `/api/plan/generate` after this fix, that's the next
thing to address (Vercel Pro lets you configure `maxDuration` per
function).

## Local dev
Unaffected — `npm run dev` still runs `tsx server.ts`, which now imports
the same `createApp()` used in production instead of duplicating route
logic.
