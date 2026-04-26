# EnerGenius frontend

Vite + React + TanStack Query + shadcn/ui. API calls go to the FastAPI app in `../backend` with `Authorization: Bearer` from Supabase.

## Setup

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optionally `VITE_API_URL` (default `http://localhost:8000`).
2. `npm install`
3. `npm run dev` — dev server (port **5173**).

Optional: set `VITE_USE_MOCKS=true` only for UI work without a running backend (uses `src/lib/api/mocks.ts`).
