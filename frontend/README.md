# EnerGenius frontend

Vite + React + TanStack Query + shadcn/ui. API calls go to the FastAPI app in `../backend` with `Authorization: Bearer` from Supabase.

## Setup

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optionally `VITE_API_URL` (default `http://localhost:8000`).
2. `npm install`
3. `npm run dev` — dev server (port **5173**).

## Supabase migrations (onboarding)

- Apply the latest SQL under `supabase/migrations/`, including `0002_gemma_availability_assistant.sql` and `0003_monthly_utility_bill.sql`.
- Verify the `profiles` trigger exists so new users get a row automatically.

Optional: set `VITE_USE_MOCKS=true` only for UI work without a running backend (uses `src/lib/api/mocks.ts`).
