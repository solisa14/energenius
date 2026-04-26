# EnerGenius frontend

Vite + React + TanStack Query + shadcn/ui. API calls go to the FastAPI app in `../backend` with `Authorization: Bearer` from Supabase.

## Setup

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optionally `VITE_API_URL` (default `http://localhost:8000`).
2. `npm install`
3. `npm run dev` — dev server (port **5173**).

## Required Setup For Onboarding + Google Calendar

- Apply the latest Supabase SQL migrations, including `supabase/migrations/0002_gemma_availability_assistant.sql`.
- Verify the `profiles` trigger exists so new users get a row automatically.
- Enable the Google auth provider in Supabase.
- Add the onboarding callback URL to the provider redirect allowlist, for example `http://localhost:5173/onboarding?calendar=oauth`.
- Ensure the Google provider supports the `https://www.googleapis.com/auth/calendar.readonly` scope.
- Run the FastAPI backend at `VITE_API_URL`; Google Calendar sync calls `/api/calendar-sync` after OAuth returns.

Optional: set `VITE_USE_MOCKS=true` only for UI work without a running backend (uses `src/lib/api/mocks.ts`).
