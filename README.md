# EnerGenius

**Smart home energy optimization dashboard that schedules household appliances to minimize cost and carbon emissions.**

EnerGenius tells homeowners exactly when to run their dishwasher, washer, dryer, EV charger, and HVAC to save money and reduce their carbon footprint. It uses a PuLP-based Mixed-Integer Linear Programming (MILP) solver to generate optimal schedules based on hourly electricity prices, grid carbon intensity, weather conditions, and personal comfort preferences. An AI chat assistant powered by Gemma 4 (via Backboard.io) personalizes recommendations through natural conversation and remembers user preferences across sessions.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Supabase Setup](#supabase-setup)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Environment Variables](#environment-variables)
- [Usage](#usage)
- [Optimization Engine](#optimization-engine)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Demo Mode](#demo-mode)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Appliance Scheduling** -- PuLP MILP solver generates three schedule options per appliance (cost-optimized, balanced, and convenience-optimized), respecting circuit power limits, quiet hours, and user availability.
- **HVAC Scheduling** -- Threshold-based heating/cooling schedule derived from outdoor temperature forecasts and user-defined comfort ranges.
- **AI Chat Assistant** -- Gemma 4 integration through Backboard.io with persistent memory, enabling natural-language Q&A about recommendations, grid conditions, and scheduling preferences.
- **Adaptive Preferences** -- Feedback loop that learns from user choices over time using exponential moving average weight adaptation. When you click "Use this time," the system nudges its cost/emissions/satisfaction weights toward your revealed preference.
- **Real-Time Grid Mix** -- Visual breakdown of the current energy grid composition (nuclear, solar, wind, gas, etc.) so users can see when zero-carbon sources are dominant.
- **Interactive Dashboard** -- Daily timeline visualization, stat cards with animated counters, recommendation cards with one-click commitment, and a savings impact panel.
- **Dark Mode** -- Full light/dark theme support with persistent preference.
- **Onboarding Wizard** -- Five-step setup flow covering name/zip, comfort range, appliance configuration, priority ranking (drag-and-drop), and optional Google Calendar sync.
- **Demo Mode** -- Toggle to run the entire UI with hardcoded fixture data, independent of the backend. Useful for presentations and offline demos.

---

## Architecture

```
+-----------------------------------------------------------+
|                    FRONTEND (React)                        |
|  Vite + TanStack Query + Zustand + shadcn/ui + Recharts   |
|  Auth: Supabase email + Google OAuth                      |
|  API calls: fetch → FastAPI with Bearer JWT               |
+-----------------------------+-----------------------------+
                              | HTTP + JWT
+-----------------------------v-----------------------------+
|                   BACKEND (FastAPI)                        |
|  Python 3.11+ / Pydantic / PuLP / httpx                   |
|  Verifies Supabase JWT on every request                   |
|  Reads/writes Supabase Postgres via supabase-py            |
|  Calls Backboard.io for AI chat (real integration)        |
|  PuLP handles MILP optimization                           |
+-----------------------------+-----------------------------+
                              | supabase-py (service role)
+-----------------------------v-----------------------------+
|               SUPABASE (Managed Services)                 |
|  Auth: email + Google OAuth                               |
|  Postgres: profiles, appliances, availability,            |
|            feedback_events, recommendations_cache          |
|  Row Level Security: user reads/writes own rows only      |
+-----------------------------------------------------------+
```

**Auth flow:** User signs in via Supabase on the frontend, receives a JWT, and sends it as a Bearer token with every API call. FastAPI decodes and verifies the JWT using the Supabase JWT secret, extracts the `user_id`, and uses `supabase-py` with a service role key to read/write the database on behalf of that user.

---

## Tech Stack

**Frontend:**
- React 18 + TypeScript (strict mode)
- Vite (build tooling)
- TanStack Query v5 (server state)
- Zustand (client state)
- shadcn/ui + Tailwind CSS (UI components and styling)
- Recharts (charts and data visualization)
- DM Sans (typography)

**Backend:**
- Python 3.11+
- FastAPI + Pydantic
- PuLP (MILP optimization)
- supabase-py (database access)
- httpx (async HTTP for Backboard.io)
- python-jose (JWT verification)

**Infrastructure:**
- Supabase (Auth + PostgreSQL + Row Level Security)
- Backboard.io (AI chat orchestration with Gemma 4)

---

## Project Structure

```
energenius/
|-- frontend/                    # React frontend application
|   |-- src/
|   |   |-- components/          # UI components
|   |   |   |-- dashboard/       # StatCardsRow, DailyTimeline, etc.
|   |   |   |-- chat/            # ChatPanel
|   |   |   |-- onboarding/      # Wizard screens
|   |   |   |-- settings/        # SettingsPage
|   |   |   +-- shell/           # Sidebar, TopBar, ProtectedRoute
|   |   |-- hooks/               # TanStack Query hooks
|   |   |-- lib/
|   |   |   |-- api/             # API client, types, query keys, demo fixtures
|   |   |   +-- supabase.ts      # Supabase client initialization
|   |   +-- stores/              # Zustand stores (chat, theme, etc.)
|
|-- backend/                     # FastAPI backend
|   |-- main.py                  # App entry point
|   |-- requirements.txt
|   +-- app/
|       |-- auth.py              # JWT verification dependency
|       |-- config.py            # Settings via Pydantic BaseSettings
|       |-- database.py          # Supabase client factory
|       |-- models/
|       |   +-- schemas.py       # Pydantic models (source of truth)
|       |-- routers/
|       |   |-- recommendations.py
|       |   |-- feedback.py
|       |   |-- chat.py
|       |   |-- availability_actions.py
|       |   +-- external_data.py
|       +-- services/
|           |-- scoring.py       # PuLP MILP solver
|           |-- adaptation.py    # Weight update from feedback
|           |-- hvac.py          # Threshold-based HVAC scheduling
|           |-- chat_orchestrator.py  # Backboard.io + Gemma 4
|           |-- calendar_parser.py
|           +-- external_data.py # Mocked price/carbon/weather data
|
|-- optimization/                # Standalone PuLP optimization engine
|   |-- pulp_optimization_engine.py
|   |-- mockScheduleData.json
|   +-- run_pulp_example.py
|
|-- supabase/
|   +-- migrations/              # SQL migration files
|       |-- 0001_init.sql
|       |-- 0002_gemma_availability_assistant.sql
|       +-- 0003_monthly_utility_bill.sql
|
|-- PRD.md                       # Product Requirements Document (v5)
|-- CLAUDE.md                    # Claude Code guidance
+-- .cursorrules                 # Cursor AI project rules
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- A **Supabase** project (free tier works)
- A **Backboard.io** account with an assistant configured for Gemma 4 (optional -- the app degrades gracefully without it)

### Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com).
2. Note your **Project URL**, **Anon Key**, **Service Role Key**, and **JWT Secret** from Project Settings > API.
3. Open the SQL Editor and run the migration files in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_gemma_availability_assistant.sql`
   - `supabase/migrations/0003_monthly_utility_bill.sql`
4. (Optional) Enable Google OAuth under Authentication > Providers if you want the "Continue with Google" sign-in option.

### Backend Setup

```bash
# From the repo root
cd backend
pip install -r requirements.txt

# Create your .env file (see Environment Variables below)
cp .env.example .env
# Fill in your Supabase and Backboard credentials

# Start the server
uvicorn backend.main:app --reload --port 8000
```

Verify the server is running:
```bash
curl http://localhost:8000/health
# Should return: {"ok": true}
```

### Frontend Setup

```bash
cd frontend
npm install

# Create your .env.local file
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key

npm run dev
# Runs on http://localhost:5173
```

### Environment Variables

**Frontend** (`frontend/.env.local`):

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |
| `VITE_USE_MOCKS` | Set to `"true"` to bypass the backend entirely (UI-only dev) |

**Backend** (`backend/.env`):

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret for token verification |
| `BACKBOARD_API_KEY` | Backboard.io API key for AI chat |
| `BACKBOARD_BASE_URL` | Backboard.io base URL (e.g., `https://app.backboard.io/api`) |
| `BACKBOARD_ASSISTANT_ID` | Your Backboard.io assistant ID |
| `GOOGLE_AI_API_KEY` | (Optional) Google AI API key for direct Gemma fallback |

---

## Usage

1. **Sign up** with email or Google OAuth.
2. **Complete onboarding** -- enter your name and zip code, set your comfort temperature range, select and configure your appliances, rank your priorities (cost vs. emissions vs. convenience), and optionally connect Google Calendar.
3. **View the dashboard** -- the daily timeline shows your optimized appliance schedule alongside HVAC recommendations. The grid mix widget displays the current energy source breakdown for your region.
4. **Commit a recommendation** -- click "Use this time" on any recommendation card. The savings counter ticks up, and the system records your preference to improve future recommendations.
5. **Chat with the assistant** -- ask questions like "Why is 2 PM the best time today?" or give instructions like "Don't run the dishwasher before 9 AM." The assistant remembers your preferences across sessions.
6. **Adjust settings** -- modify your profile, appliance configurations, or priority weights at any time from the Settings page.

---

## Optimization Engine

The core scheduling algorithm lives in `optimization/pulp_optimization_engine.py` and `backend/app/services/scoring.py`. It formulates a Mixed-Integer Linear Program using PuLP with the CBC solver.

**Decision variables:** Binary variables for each appliance and each possible start slot (48 half-hour slots per day).

**Objective function:** Minimize the weighted sum of normalized electricity cost, carbon emissions, and (1 - user satisfaction), where weights are pulled from the user's profile and adapt over time based on feedback.

**Constraints:**
- Exactly one start slot per appliance
- Start slot falls within the appliance's allowed window (earliest start to latest finish)
- Noisy appliances cannot run during quiet hours
- Total power draw across all running appliances in any slot does not exceed the circuit power limit

The solver runs three times with different weight configurations to produce three schedule options per appliance: cost-optimized ("Best"), balanced, and convenience-optimized ("Convenient").

To run the standalone optimization engine:

```bash
python optimization/run_pulp_example.py
```

---

## API Endpoints

All endpoints (except `/health`) require a valid Supabase JWT in the `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/recommendations?date=YYYY-MM-DD` | Get optimized schedule for a given date |
| `POST` | `/api/feedback` | Submit feedback on a recommendation (yes/no/different_time) |
| `POST` | `/api/chat` | Send a message to the AI assistant |
| `GET` | `/api/external-data?zip=XXXXX&date=YYYY-MM-DD` | Get electricity prices, carbon intensity, and weather data |
| `POST` | `/api/calendar-sync` | Sync calendar availability |

---

## Database Schema

The Supabase PostgreSQL database includes five core tables, all protected by Row Level Security:

- **profiles** -- User profile with name, zip code, HVAC comfort range (t_min_f, t_max_f), optimization weights (cost/emissions/satisfaction), circuit power limit, quiet hours, and timezone.
- **appliances** -- User-configured appliances with duration (in 30-min slots), power draw (kW), allowed scheduling window, noise flag, and satisfaction-by-time preferences.
- **availability** -- Per-day, 48-slot boolean array representing which half-hour windows the user is available for appliance scheduling.
- **feedback_events** -- Log of user feedback on recommendations, used to drive the weight adaptation algorithm.
- **recommendations_cache** -- Cached daily recommendation payloads to avoid re-solving the MILP on every request.

A database trigger automatically creates a `profiles` row when a new user signs up through Supabase Auth.

---

## Demo Mode

The frontend includes a Demo Mode toggle (visible in the top bar) that short-circuits all API calls with hardcoded fixture data. This is useful for presentations, offline demos, or UI development without running the backend.

When Demo Mode is active, the AI chat panel continues to make real calls to the backend by default (since the live chat is a key demo moment). A separate "Demo Chat" toggle can be enabled to mock chat responses as well.

To run the frontend in fully mocked mode without any backend:
```bash
# In frontend/.env.local
VITE_USE_MOCKS=true
npm run dev
```
