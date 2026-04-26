# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

EnerGenius is an energy-optimization dashboard (8-hour hackathon project) that schedules household appliances to minimize cost and emissions using a MILP solver, with AI chat assistance. The key constraint: **no real external API calls** — prices, carbon intensity, and weather are all mocked. The only real external service besides Supabase is Backboard.io (AI chat).

## Commands

### Frontend (run from `frontend/`)
```bash
npm run dev          # Vite dev server on port 5173
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest (single run)
npm run test:watch   # Vitest watch mode
```

### Backend (run from repo root)
```bash
uvicorn backend.main:app --reload --port 8000
```

### Optimization (standalone)
```bash
python optimization/run_pulp_example.py
```

## Architecture

Three-tier: React frontend → FastAPI backend → Supabase (Postgres + Auth).

**Frontend** (`frontend/src/`):
- Auth via `AuthContext` (Supabase session); all API calls auto-inject JWT via `src/lib/api/client.ts`
- Server state: TanStack Query v5 with keys from `src/lib/api/queryKeys.ts`
- UI state: Zustand stores in `src/stores/` (`applianceSelections`, `chatThread`)
- Components: shadcn/ui + Tailwind; design tokens only via Tailwind config
- `VITE_USE_MOCKS="true"` enables fully mocked API responses for UI-only dev

**Backend** (`backend/app/`):
- All routes require `get_current_user_id` dependency (decodes Supabase JWT using `SUPABASE_JWT_SECRET`)
- DB access exclusively via `get_supabase()` (service role key, `supabase-py`)
- Pydantic models are the source of truth; `frontend/src/lib/api/types.ts` mirrors them manually
- Routers: `recommendations`, `feedback`, `chat`, `availability_actions`, `external_data`
- Key services: `scoring.py` (wraps PuLP), `hvac.py`, `chat_orchestrator.py` (Backboard + Gemma fallback), `adaptation.py` (weight updates from feedback)

**Recommendations data flow:**
1. JWT → `user_id`
2. Fetch profile (weights, ZIP, HVAC setpoints) + appliances + availability from Supabase
3. Fetch mocked external data (prices/carbon/weather curves) from `services/external_data.py`
4. `MultiSolutionEngine` in `optimization/pulp_optimization_engine.py` runs MILP → 3 options (cost-optimized, balanced, comfort-optimized)
5. HVAC schedule appended; response cached in `recommendations_cache` table

**Supabase schema** (`supabase/migrations/`):
- Base: `0001_init.sql` — `profiles`, `appliances`, `availability` (48-slot array per day), `feedback_events`, `recommendations_cache`
- `0002_gemma_availability_assistant.sql` — `availability_assistant_actions`, `profiles.timezone`, `appliances.requires_presence`
- `0003_monthly_utility_bill.sql` — `profiles.monthly_utility_bill_usd`
- RLS on all tables; trigger auto-creates `profiles` row on signup

## Environment Variables

**Frontend** (`.env.local`):
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_USE_MOCKS        # "true" to bypass backend
```

**Backend** (`.env` or `backend/.env`):
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
BACKBOARD_API_KEY
BACKBOARD_BASE_URL
BACKBOARD_ASSISTANT_ID
GOOGLE_AI_API_KEY     # optional Gemma fallback
```

## Hard Constraints (from .cursorrules)

- **No real OpenEI / Electricity Maps / OpenWeatherMap calls** — keep all external data mocked in `services/external_data.py`
- **No retry/rate-limit/circuit-breaker logic**, no observability tooling, no CI/Docker
- **No MFA, email verification, or password rules** on the frontend auth flows
- **CORS `*`** is intentional for hackathon scope — do not add allowlists
- Chat threads are keyed by `user_id` (one thread per user); Backboard.io manages the Gemma 4 model

## TypeScript / Python Style

- TypeScript strict mode; `@` alias maps to `frontend/src/`
- Python: type hints + Pydantic everywhere; `backend/app/config.py` (`Settings`) is the single config source
- Minimal comments — only when the "why" is non-obvious
