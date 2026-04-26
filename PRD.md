# EnerGenius — PRD v5 (Cursor + FastAPI 8-Hour Solo Build Guide)

> **What changed in v5:** Replaced Lovable with **Cursor** as the primary build environment. Cursor now owns the entire stack — React frontend, FastAPI backend, PuLP optimization, Backboard.io chat client, everything. Instead of Lovable scaffolding empty Python files for a team to fill in later, **you (the vibe coder) drive Cursor through Plan mode in Chat to design each backend service, then switch to Agent/Composer mode to implement it**. You understand the architecture; Cursor handles the code. Supabase remains the auth provider and database. External market data (electricity prices, grid carbon, weather) is still **mocked with hardcoded realistic curves inside the FastAPI service layer**. Backboard.io chat with Gemma 4 remains a real, working integration. The "scaffold-only Python" guardrail from v4 is gone — Cursor writes function bodies, but only what each prompt explicitly asks for.

---

## Architecture Overview (Read First)

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Cursor)                     │
│  React + Vite + TanStack Query + Zustand + shadcn/ui    │
│  Auth: supabase.auth (email + Google OAuth)             │
│  API calls: fetch("http://localhost:8000/api/...")       │
│             with Authorization: Bearer <supabase_jwt>   │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP + JWT
┌────────────────────────▼────────────────────────────────┐
│                  BACKEND (Cursor)                        │
│  Python 3.11+ / FastAPI / Pydantic / PuLP               │
│  Verifies Supabase JWT on every request                 │
│  Reads/writes Supabase Postgres via supabase-py         │
│  Calls Backboard.io for chat (real integration)         │
│  PuLP handles optimization (scoring, scheduling)        │
└────────────────────────┬────────────────────────────────┘
                         │ supabase-py (service role)
┌────────────────────────▼────────────────────────────────┐
│               SUPABASE (Managed Services)               │
│  Auth: email + Google OAuth (default helpers only)      │
│  Postgres: profiles, appliances, availability,          │
│            feedback_events, recommendations_cache        │
│  RLS: user reads/writes own rows only                   │
└─────────────────────────────────────────────────────────┘
```

**How auth flows:**

1. User signs in via Supabase auth on the frontend.
2. Frontend gets a Supabase JWT access token.
3. Every API call to FastAPI includes `Authorization: Bearer <jwt>`.
4. FastAPI decodes and verifies the JWT using the Supabase JWT secret, extracts `user_id`.
5. FastAPI uses `supabase-py` with the service role key to read/write the database on behalf of that user.

**The vibe-coder workflow with Cursor:**

- You read the prompt and the architecture spec; Cursor reads the codebase and the `.cursorrules` file.
- For multi-file or non-trivial work, you start in **Plan mode in Chat** ("plan this, don't write code yet"). Cursor proposes files, signatures, dependencies. You review and refine the plan in chat.
- Once you're happy with the plan, you say "go" and Cursor switches to **Agent/Composer mode** to apply edits across files.
- You review the diff, accept or reject, and iterate.
- For one-off tweaks ("rename this prop", "fix this style"), you use Tab autocomplete or Cmd-K inline edits — no Plan mode needed.

---

## Critical Anti-Patterns (Read First, Repeat Often)

The single biggest failure mode of AI-assisted hackathons: the agent hallucinates enterprise features you never asked for (JWT refresh logic, MFA, retry-with-backoff, rate limiting, exhaustive test suites). Every prompt in this document ends with a universal suffix that re-states these constraints, and a `.cursorrules` file at the repo root pins them as a project-wide guardrail. **Do not remove either.**

**Cursor must NEVER, in this build, do any of the following:**

1. Implement custom JWT, refresh tokens, or session logic on the **frontend** beyond Supabase's default auth helper. (The backend does verify JWTs — that is correct and required.)
2. Add password complexity rules, email verification flows, password reset, or MFA on the frontend.
3. Add rate limiting, retry-with-backoff, request queuing, circuit breakers, or idempotency keys.
4. Call real external market-data APIs (OpenEI, Electricity Maps, OpenWeatherMap) — those three are mocked with hardcoded arrays inside the FastAPI service layer.
5. Add observability tools (Sentry, PostHog, Datadog, custom logging infrastructure).
6. Write tests — unit, integration, e2e, snapshot, none. (You can request a one-off `python -m backend.smoke_test` script in Phase 7 if you want, but no `pytest` suite.)
7. Invent its own scoring formula or weight-adaptation logic that contradicts what the prompt specifies. Cursor *implements* PuLP and adaptation — but only against the math each prompt describes.
8. Add multi-tenancy beyond Supabase's default Row Level Security.
9. Add CSP headers, CORS allowlists beyond `*`, or any custom security middleware.
10. Add a "production deployment" checklist, CI config, Dockerfile, or environment switching logic.
11. Drift outside the scope of the current prompt. If a prompt asks for the StatCardsRow, Cursor does not also build the timeline. If a prompt asks for the scoring service, Cursor does not also implement the adaptation service.

**Things that ARE real in this build (do not stub these):**

- The chat integration calls **Backboard.io** with a persistent thread per user. Backboard owns the team's Google AI Studio BYOK setup, and FastAPI overrides each response to use **Gemma 4** through Backboard (`llm_provider="google"`, `model_name="gemma-4-31b-it"`). This is a working integration, not a stub.
- The frontend hooks, types, and components all wire to real FastAPI endpoint URLs.
- The PuLP optimization is real — Cursor implements it, you review it.
- The HVAC threshold logic, the adaptation update, the calendar parser — all real, all implemented by Cursor.
- The scoring formula's **inputs** (price arrays, carbon arrays, user weights, satisfaction by time) are real and come from the database / mocked external-data service. Only the three real-world data sources (OpenEI, Electricity Maps, OpenWeatherMap) are mocked because integrating them in 8 hours is a distraction.

**The mantra:** "Real architecture, real chat, real frontend, real Python. Mock the third-party data we don't have time to integrate. Implement only what the current prompt asks for."

---

## How to Use This Document

This PRD is meant to be **executed in phases**, not pasted as a single mega-prompt. Each phase below contains:

- A **"Prompt to paste into Cursor Chat"** block (the actual text to send)
- The **Cursor mode** to use (Plan mode in Chat, Agent/Composer, or inline Cmd-K)
- **Acceptance criteria** (how to know the phase is done)
- **What NOT to ask** (guardrails to keep scope tight)

**Universal rule:** Before running any non-trivial phase prompt, append the **Universal Prompt Suffix** below. For multi-file work, start in Plan mode and let Cursor interrogate the spec before editing anything. This single habit produces the largest quality lift in the entire workflow.

### Universal Prompt Suffix (Append to EVERY Prompt)

```text
Before generating, ask any clarifying questions you need. If this work
spans more than two files, stay in Plan mode in Chat first — describe
the plan as a numbered list (files to create/modify, key functions,
data flow), wait for my "go", then switch to Agent/Composer to apply
edits.

Constraints for this build (do NOT violate; they are also pinned in
@.cursorrules):
- Use Supabase's default auth helpers on the frontend ONLY. No custom
  JWT logic in the frontend. No MFA, no password rules, no email
  verification.
- The backend is FastAPI (Python). Implement what this prompt asks for
  and nothing else. No bonus features, no "helpful" extras.
- No retry-with-backoff, no rate limiting, no observability tools
  (Sentry, PostHog, Datadog), no custom logging infrastructure.
- No tests. No CI config. No Dockerfile.
- Do not call OpenEI, Electricity Maps, or OpenWeatherMap. Those three
  data sources are mocked with hardcoded arrays inside the FastAPI
  service layer (`backend/app/services/external_data.py`).
- DO call Backboard.io for chat — that integration IS real.
- Stick to the architecture in @PRD.md and @.cursorrules. Do not invent
  features I did not request. Do not refactor code outside the scope of
  this prompt.
- When you're done, list every file you created or modified and give me
  a one-sentence summary of what each change does.
```

This suffix is the **single highest-leverage habit** in this document. It is not optional.

### `.cursorrules` File (Create This in Phase 1)

Cursor reads a `.cursorrules` file (or `.cursor/rules/*.mdc` files) at the repo root on every prompt. This is your persistent guardrail — even when you forget the suffix, Cursor still sees these rules. **Create this file as the very first step in Phase 1.**

```text
# EnerGenius — Cursor Project Rules

## Project context
EnerGenius is an 8-hour hackathon build of an energy-optimization
dashboard. Frontend: React + Vite + TanStack Query + Zustand + shadcn/ui.
Backend: FastAPI + PuLP + supabase-py. Auth + DB: Supabase. Chat:
Backboard.io with Gemma 4. The full architecture is in @PRD.md.

## Workflow
- Default to Plan mode in Chat for any multi-file change. Propose a
  numbered plan, wait for confirmation, then apply edits.
- Ask clarifying questions before generating when intent is ambiguous.
- Make atomic edits. One feature at a time. Do not refactor outside
  the current scope.
- After every change, list the files touched and a one-line summary
  of each.

## Frontend constraints
- Use Supabase's default auth helpers ONLY. No custom JWT decoding,
  no refresh token logic, no MFA, no password rules, no email
  verification flows.
- All API calls go through the typed client in `src/lib/api/client.ts`.
- All server state through TanStack Query hooks in `src/hooks/`.
- All design tokens (colors, spacing, type, radii, shadows) come from
  Tailwind theme — do not hardcode hex values in components.
- Buttons, badges, cards, sheets, toasts, modals: always use shadcn/ui
  primitives, never raw HTML.
- Loading states: shimmer that matches the final layout. Never
  spinners. Never skeleton boxes the wrong size.

## Backend constraints
- Pydantic models in `backend/app/models/schemas.py` are the single
  source of truth for request/response shapes. The TypeScript types
  in `src/lib/api/types.ts` mirror them by hand.
- Every router uses the `get_current_user_id` dependency from
  `backend/app/auth.py`.
- Database access goes through `get_supabase()` from
  `backend/app/database.py`.
- `backend/app/services/external_data.py` returns hardcoded constants
  for prices, carbon, temperature, and grid mix. Do NOT add real API
  calls to OpenEI, Electricity Maps, or OpenWeatherMap.
- `backend/app/services/backboard_client.py` is the ONE real external
  integration. It creates/reuses Backboard threads and POSTs messages
  with `llm_provider="google"` and `model_name="gemma-4-31b-it"`.
- PuLP is the optimization library. Use `LpProblem(LpMinimize)`,
  `LpVariable`, `lpSum` — nothing fancier.

## Anti-patterns (NEVER do these)
- No retry-with-backoff. No rate limiting. No circuit breakers.
- No Sentry, PostHog, Datadog, or custom logging infra.
- No unit, integration, e2e, snapshot, or smoke tests unless I
  explicitly ask in a prompt.
- No CI config. No Dockerfile. No deployment scripts.
- No environment-switching logic beyond reading from .env.
- No CORS allowlist beyond `["*"]`. No CSP headers.
- No multi-tenancy beyond Supabase RLS.
- No password complexity rules, email verification, MFA on the
  frontend.

## Style
- TypeScript: strict mode, explicit return types on exported functions.
- Python: type hints on every function signature. Pydantic for
  request/response shapes. Plain dicts only inside service internals.
- Comments only where intent isn't obvious from the code. No
  decorative banners, no "// fetch data" above a fetch call.
- Real content, never lorem ipsum. Use the copy in @PRD.md verbatim.
```

Save this as `.cursorrules` at the repo root in Phase 1.

---

## Phase 0 — Project Vision (Read Before Prompting)

Internalize this before opening Cursor.

- **What is this product?** A web dashboard that tells homeowners exactly when to run their dishwasher, washer, dryer, EV charger, and HVAC to minimize cost and carbon emissions, with an AI chat agent (Gemma 4 via Backboard.io) that personalizes the recommendations through natural conversation and remembers preferences across sessions.
- **Who is it for?** Cost-conscious, climate-aware homeowners who already have smart-home appliances and a flexible enough schedule to time-shift major loads. Demo persona: a homeowner with rooftop solar, an EV, and a dishwasher running every night at 7 PM out of habit.
- **Why will they use it?** Manually tracking hourly electricity prices, grid carbon intensity, and weather is impossible, and current utility apps only show usage *after* the fact. EnerGenius is forward-looking: it tells you what to do *next*, not what you already did.
- **What is the one key action?** Click "Use this time" on a recommendation card and watch the **Estimated Monthly Savings** number tick up.

### Aesthetic Direction (Buzzwords — Use Verbatim in Every Prompt)

> **professional, data-rich, confident, energy-tech, modern dashboard, bold-accent-on-clean-canvas, expressive metrics, climate-conscious, chart-forward, friendly-but-precise**

**Avoid:** playful, bouncy, gradient-heavy, glassmorphism, neumorphism, illustrative, hand-drawn.

### User Journey (Map Before You Prompt)

1. **Sign in → Onboarding (5 screens)** — Name + zip → comfort range → appliances → priorities (drag-to-rank) → calendar sync (optional Google OAuth).
2. **Dashboard** — Stat cards (savings + CO₂) → daily timeline → recommendation cards → grid mix widget → savings impact panel → chat panel.
3. **Commit a recommendation** — Click "Use this time" → savings number ticks up → toast confirms → chat agent remembers the preference for next time.
4. **Tweak settings later** — Settings page lets the user edit profile, appliances, and priorities.

---

## 8-Hour Solo Build Schedule (Stick to This)

Assumes one developer (you) driving Cursor.


| Hour      | Phase       | What                                                                                                   | Cursor Mode                |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------ | -------------------------- |
| 0:00–0:30 | Phase 1     | Local setup: Vite project, FastAPI tree, `.cursorrules`, Supabase project, design tokens               | Agent/Composer             |
| 0:30–1:30 | Phase 2     | Frontend foundation: auth screens, layout shell, sidebar, top bar, theme toggle                        | Plan → Agent               |
| 1:30–2:15 | Phase 3     | Backend scaffold + auth + DB layer + mocked external data + Pydantic models                            | Plan → Agent               |
| 2:15–3:15 | Phase 4     | Backend implementation: PuLP scoring, adaptation, HVAC, calendar parser, Backboard client, all routers | Plan → Agent (per service) |
| 3:15–3:45 | Phase 5.1   | Frontend API client + typed hooks (TanStack Query)                                                     | Agent                      |
| 3:45–4:15 | Phase 5.2   | StatCardsRow                                                                                           | Agent                      |
| 4:15–5:15 | Phase 5.3   | DailyTimeline (centerpiece)                                                                            | Plan → Agent               |
| 5:15–6:00 | Phase 5.4   | RecommendationCardSet (commit moment)                                                                  | Agent                      |
| 6:00–6:30 | Phase 5.5   | GridMixWidget (energy-track bonus hook)                                                                | Agent                      |
| 6:30–7:00 | Phase 5.6   | SavingsImpactPanel + ChatPanel                                                                         | Agent                      |
| 7:00–7:30 | Phase 5.7   | Onboarding wizard (5 screens) + Settings page                                                          | Agent                      |
| 7:30–8:00 | Phase 6 + 7 | Demo Mode + state audit + end-to-end test + demo script                                                | Agent + inline edits       |


**If you fall behind:** drop in this order — Settings page → Onboarding screens 4–5 → calendar sync (default availability is fine) → Demo Mode polish. Do **not** drop the chat panel or the grid mix widget — those are the demo's two strongest moments. Do not drop the PuLP implementation either; it is the technical claim of the demo.

**Cursor leverage tips throughout the build:**

- Keep `@PRD.md` open in a tab and reference it in every prompt with `@PRD.md`.
- Reference `@.cursorrules` whenever Cursor starts to drift.
- Use `@file` to scope Cursor's attention to a specific file when iterating.
- For inline tweaks ("change CTA text", "rename this prop"), use Cmd-K (or Ctrl-K) instead of opening a new Chat thread — it's faster and lower-credit.
- For multi-file rewrites, switch to Composer (Cmd-I) and use Plan mode first.

---

## Phase 1 — Local Setup + Cursor Configuration (30 min)

**Goal:** Get a clean local repo with `.cursorrules` pinned, Supabase wired, design tokens locked, and both `npm run dev` and `uvicorn` ready to run (even if backend routes return 501 for now).

### 1.1 — Manual setup (5 min, no Cursor)

You do these by hand because they're outside Cursor's loop:

1. `npm create vite@latest energenius -- --template react-ts`
2. `cd energenius && npm install`
3. `npm install @tanstack/react-query zustand @supabase/supabase-js recharts react-countup`
4. `npm install -D tailwindcss postcss autoprefixer`
5. `npx tailwindcss init -p`
6. Install shadcn/ui: `npx shadcn@latest init` then `npx shadcn@latest add button card input badge dialog sheet tabs toggle toast tooltip switch slider`
7. Create the `backend/` directory at the repo root: `mkdir backend`
8. Create the `.cursorrules` file at the repo root with the contents from the section above.
9. Save this PRD as `PRD.md` at the repo root so you can `@PRD.md` it.
10. Open the repo in Cursor.
11. Create a new Supabase project at supabase.com. Note down the URL, anon key, service role key, and JWT secret.

### 1.2 — Cursor prompt: design system + Supabase + layout shell + DB schema (25 min)

**Cursor mode:** Composer (Cmd-I). Plan mode first, then Agent.

```text
@PRD.md @.cursorrules

Set up the EnerGenius foundation. Stay focused on this scope only:
design tokens, Supabase wiring, layout shell, database schema. Do
NOT build dashboard content yet — leave the main content area as a
placeholder labeled "Dashboard content lands here in Phase 5".

PRODUCT CONCEPT
EnerGenius recommends optimal times to run home appliances (dishwasher,
washer, dryer, EV charger, water heater) and intelligently schedules HVAC,
based on hourly electricity prices, grid carbon intensity, and weather.
An AI chat agent personalizes the recommendations and remembers user
preferences across sessions.

AESTHETIC
Professional, data-rich, confident, energy-tech. Modern dashboard with
bold yellow accents on a clean off-white canvas. Expressive metrics,
chart-forward, friendly-but-precise. Not playful, not gradient-heavy,
no glassmorphism.

DESIGN SYSTEM (lock these in tailwind.config.ts theme.extend)

Font: DM Sans from Google Fonts, weights 400/500/600/700. Add the
@import to src/index.css and set as the default sans family in Tailwind.

CSS variables (define in src/index.css under :root and .dark):

Light mode:
  --bg-page: #F9FFF5
  --bg-surface: #FFFFFF
  --accent-primary: #FFFE56     (yellow)
  --accent-secondary: #57B756   (green)
  --text-primary: #1A1A1A
  --text-secondary: #5C5C5C
  --text-tertiary: #8A8A8A
  --border: #E0E0E0
  --error: #D32F2F  /  --error-bg: #FDECEA
  --warning: #F9A825 / --warning-bg: #FFF8E1
  --success: #57B756 / --success-bg: #E8F5E9
  --info: #1976D2 /    --info-bg: #E3F2FD

Dark mode:
  --bg-page: #121212
  --bg-surface: #1E1E1E   /  --bg-elevated: #2A2A2A
  --accent-primary: #FFFE56 (unchanged)
  --accent-secondary: #6ECF6D (lightened green)
  --text-primary: #F5F5F5 / --text-secondary: #B0B0B0 / --text-tertiary: #757575
  --border: #333333

CRITICAL CONTRAST RULE: Never put white text on yellow or green accents.
Always use dark text (#1A1A1A) on yellow and green fills.

Type scale (1.25 ratio, 16px base) — expose as Tailwind text- utilities:
  display 40px/1.2 Bold -0.02em
  h1      32px/1.25 Bold -0.015em
  h2      25px/1.3 SemiBold -0.01em
  h3      20px/1.35 SemiBold -0.005em
  h4      16px/1.4 SemiBold
  body-lg 18px/1.6 Regular
  body    16px/1.6 Regular
  body-sm 14px/1.5 Regular  0.005em
  caption 12px/1.4 Medium 0.01em
  overline 11px/1.4 SemiBold 0.08em UPPERCASE

Spacing scale (4px base): 4, 8, 12, 16, 24, 32, 48, 64.

Radii: button-pill 9999px, card 16px, input 12px, modal 20px,
badge 8px, tooltip 8px.

Shadows (light mode):
  sh-1: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)
  sh-2: 0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)
  sh-3: 0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)
Dark mode: same offsets, opacities 0.3 / 0.4 / 0.5.

Icons: Google Material Symbols Outlined via stylesheet link in
index.html. 24px standard, 20px compact, 16px inline.

Buttons (override shadcn/ui Button variants):
  primary: pill, fill #1A1A1A, white text, 48px height, 12px/24px
    padding, 16px SemiBold. Hover #333333 + scale(1.02). Focus: 2px
    green offset ring.
  secondary: 2px black border, transparent fill, black text. Hover
    tint rgba(26,26,26,0.06).
  ghost: no border/fill, text only. Hover tint rgba(26,26,26,0.04).
  destructive: #D32F2F fill, white text. Hover #E53935.
  Sizes: small 36px, medium 48px (default), large 56px.

Inputs: 48px height, 1.5px #E0E0E0 border, 12px radius, white fill,
16px text in #1A1A1A, placeholder #8A8A8A. Focus: 2px green border +
0 0 0 3px rgba(87,183,86,0.15) glow. Error: same in red. Always a
visible 14px Medium label above with 6px gap. 12px caption helper
below with 4px gap.

Cards: white surface on the F9FFF5 page, 16px radius, 24px padding,
sh-1 shadow, optional 1px #E0E0E0 border. Interactive cards lift to
sh-2 on hover with a 200ms ease transition.

Motion: 150ms ease for hover, 200ms ease-in-out default, 300ms
ease-in-out for page transitions. No bouncy or playful motion.

LAYOUT SHELL (build now)
- Fixed left sidebar (240px desktop, collapsible to icon-only at <1024px):
    - Brand wordmark "EnerGenius" at top in h3 with a yellow lightning-bolt
      Material icon to its left.
    - Overline label "MAIN MENU" 24px below the brand.
    - Nav items (icon + label, 48px tall rows): Dashboard, Recommendations,
      Schedule, Insights, Chat, Settings. Active item: yellow #FFFE56 fill,
      12px radius, dark text. Inactive: secondary text, no fill.
- Top bar (64px, inside main content area, above page title):
    - Search input on the left (placeholder: "Search appliances,
      recommendations, or ask a question…"), 320px wide, search icon
      inside on the left.
    - On the right: theme toggle (sun/moon ghost button), notifications
      bell with a small yellow dot indicator, 32px circular avatar
      "AR" on yellow with dark text.
- Main content region: page title "Dashboard" as h1, breadcrumb
  "Home / Dashboard" as caption above it, then a card with the
  placeholder text mentioned at the top of this prompt.

ROUTING
Use react-router-dom. Routes: /signin, /signup, /onboarding, /dashboard,
/settings, /chat. Wrap the dashboard/settings/chat routes in a layout
component that renders the sidebar + top bar.

SUPABASE SETUP
Create src/lib/supabase.ts that initializes the supabase-js client from
VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (in .env.local).

Build sign-in and sign-up screens at /signin and /signup matching the
design system: email + password fields and a "Continue with Google"
button. Use supabase.auth.signInWithPassword and
supabase.auth.signInWithOAuth({ provider: 'google' }).

Redirect rules:
  - Authenticated user with profile.home_zip set → /dashboard
  - Authenticated user without home_zip → /onboarding
  - Unauthenticated → /signin
Use a small useSession hook backed by supabase.auth.onAuthStateChange.

NO email verification, NO password complexity rules, NO MFA, NO custom
JWT logic. Use exactly what Supabase provides out of the box.

DATABASE TABLES (write a SQL migration file at
supabase/migrations/0001_init.sql that I will paste into the Supabase
SQL editor; do NOT try to apply it programmatically):

  profiles(
    id uuid pk → auth.users,
    full_name text,
    home_zip text,
    t_min_f int default 68,
    t_max_f int default 76,
    cost_weight float default 0.4,
    emissions_weight float default 0.2,
    satisfaction_weight float default 0.4,
    circuit_power_limit float default 7.2,
    quiet_hours int[] default '{0,1,2,3,4,5,6,7,8,9,10,11,44,45,46,47}',
    created_at timestamptz default now()
  )
  appliances(
    id text pk,
    user_id uuid fk → profiles,
    name text,
    duration int,
    power_kw float,
    earliest_start int,
    latest_finish int,
    is_noisy bool,
    satisfaction_by_time jsonb,
    enabled bool default true
  )
  availability(
    user_id uuid fk → profiles,
    date date,
    slots bool[48] not null,
    primary key (user_id, date)
  )
  feedback_events(
    id uuid pk default gen_random_uuid(),
    user_id uuid fk → profiles,
    appliance text,
    chosen_option text,
    response text,
    suggested_time timestamptz,
    created_at timestamptz default now()
  )
  recommendations_cache(
    user_id uuid,
    date date,
    payload jsonb,
    cached_at timestamptz,
    primary key (user_id, date)
  )

Enable Row Level Security on every table with the simplest policy:
a user reads/writes their own rows where user_id = auth.uid(). No
admin policies, no service-role overrides, no audit logging.

Add a trigger that creates a profiles row on auth.users insert.

Stop after: design tokens locked, layout shell rendering, sign-in and
sign-up screens working, migration file generated, theme toggle
working. Do NOT create FastAPI files in this prompt.

[APPEND THE UNIVERSAL PROMPT SUFFIX HERE]
```

### Acceptance criteria

- `.cursorrules` and `PRD.md` exist at repo root.
- A signed-out user lands on `/signin` with email + Google buttons styled per the design system.
- A signed-in user with no `home_zip` lands on `/onboarding` (which is empty for now — that's fine).
- A signed-in user with `home_zip` lands on `/dashboard` with the sidebar, top bar, and a single placeholder card.
- Yellow and green tokens render correctly on hover, focus, active.
- Dark mode toggle swaps all surfaces, text, shadows.
- The migration SQL has been pasted into Supabase SQL editor and all 5 tables exist with RLS enabled.

### What NOT to ask in this phase

- Charts, recommendation cards, chat panel, or any data widgets.
- FastAPI files or backend scaffolding.
- The onboarding flow contents (Phase 5.7).

---

## Phase 2 — Frontend Foundation Polish + Auth Hooks (1 hr)

This phase tightens what Phase 1 built. After this, you switch to backend for a couple of hours, then come back to frontend components.

### 2.1 — Cursor prompt: auth state + protected routes + theme persistence

**Cursor mode:** Composer with Plan mode.

```text
@PRD.md @.cursorrules @src/App.tsx @src/lib/supabase.ts

Tighten the foundation built in Phase 1. Specifically:

1. Create `src/hooks/useSession.ts` that returns
   { session, user, isLoading, signOut } from Supabase auth, backed by
   onAuthStateChange. Uses useEffect for the subscription, cleans up
   on unmount.

2. Create `src/components/shell/ProtectedRoute.tsx` that wraps a route
   and redirects:
     - to /signin if no session
     - to /onboarding if session but profiles.home_zip is null
     - renders children otherwise
   Show a centered shimmer card while session loads.

3. Apply ProtectedRoute to /dashboard, /settings, /chat.

4. Add a small Zustand store at `src/stores/themeStore.ts` that
   persists theme (light/dark) to localStorage and applies the .dark
   class to <html>. Wire the theme toggle in TopBar to it.

5. Add a sign-out item at the bottom of the sidebar (ghost button
   with logout Material icon). Click → signOut() → redirect to /signin.

6. Add a top-level <ErrorBoundary> at the layout level that catches
   render errors and shows a friendly recovery card with a "Refresh"
   button. Do NOT add Sentry or any external observability.

That's the entire scope. Do not touch backend files. Do not build
dashboard content. Do not add tests.

[APPEND THE UNIVERSAL PROMPT SUFFIX HERE]
```

### Acceptance criteria

- Closing and reopening the browser preserves theme choice.
- Visiting `/dashboard` while signed out redirects to `/signin`.
- Sign-out works and routes you back to `/signin`.
- Throwing an error inside the dashboard component shows the recovery card, not a white screen.

---

## Phase 3 — Backend Plan + Scaffold + Foundation Layer (45 min)

This is the first backend phase. You will use Cursor's **Plan mode in Chat** to *design* the backend, then switch to Agent/Composer to build the scaffolding and the foundation layer (auth, DB factory, Pydantic models, mocked external data).

The PuLP scoring, adaptation, HVAC, and Backboard client come in Phase 4 — separate prompts so each gets a focused plan.

### 3.1 — Cursor prompt: PLAN the backend (5 min, Plan mode in Chat)

**Cursor mode:** Chat in Plan mode (do not let Cursor edit yet).

```text
@PRD.md @.cursorrules

I'm about to build the EnerGenius FastAPI backend. Before any code,
review @PRD.md (architecture overview, data model, the routers and
services you'll see referenced in Phase 5 frontend prompts) and propose:

1. The exact `backend/` directory tree, file by file, with a one-line
   purpose for each file.
2. The list of Python dependencies with versions or version-free pins
   appropriate for FastAPI + PuLP + supabase-py.
3. The Pydantic models I'll need in `backend/app/models/schemas.py`,
   listed with their field names and types. The frontend types in
   `src/lib/api/types.ts` will mirror these by hand later.
4. The data flow for the GET /api/recommendations endpoint, end to end:
   request → JWT verify → DB reads → service calls → response shape.
5. The data flow for POST /api/feedback.
6. The data flow for POST /api/chat (Backboard.io integration).
7. Any integration risks I should know about (e.g. Backboard auth
   header format, supabase-py service-role usage, PuLP solver
   selection on macOS).

Output the plan as a numbered Markdown document. Do NOT write any code
or modify any files yet. After I review and confirm, I'll tell you
"go" and we'll move to scaffolding.
```

You read the plan, push back on anything that drifts (e.g. if Cursor proposes a Celery task queue, say no). Once you're happy, reply with "go — switch to Composer and scaffold the file tree per the plan, plus implement the foundation layer per prompt 3.2 below."

### 3.2 — Cursor prompt: scaffold + foundation layer (40 min)

**Cursor mode:** Composer/Agent.

```text
@PRD.md @.cursorrules

Per the plan we just agreed on, scaffold the backend and implement the
FOUNDATION LAYER ONLY. The scoring, adaptation, HVAC, calendar parser,
and Backboard client come in Phase 4 — leave their bodies as
`raise NotImplementedError("Phase 4")` for now (we want focused plans
for each).

CREATE THE TREE
backend/
├── main.py
├── requirements.txt
├── .env.example
├── app/
│   ├── __init__.py
│   ├── config.py
│   ├── auth.py
│   ├── database.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── recommendations.py
│   │   ├── feedback.py
│   │   ├── chat.py
│   │   ├── calendar_sync.py
│   │   └── external_data.py
│   └── services/
│       ├── __init__.py
│       ├── scoring.py
│       ├── adaptation.py
│       ├── hvac.py
│       ├── calendar_parser.py
│       ├── backboard_client.py
│       └── external_data.py

WHAT TO IMPLEMENT FULLY IN THIS PROMPT
1. backend/main.py
   - FastAPI app titled "EnerGenius API"
   - CORSMiddleware with allow_origins=["*"], allow_methods=["*"],
     allow_headers=["*"]
   - Mount all 5 routers under /api prefix
   - Add a GET /health that returns {"ok": True}
   - Comment at top: "Run with: uvicorn backend.main:app --reload --port 8000"

2. backend/requirements.txt
     fastapi
     uvicorn[standard]
     pydantic
     pydantic-settings
     python-jose[cryptography]
     supabase
     httpx
     pulp
     python-dotenv

3. backend/.env.example
     SUPABASE_URL=https://your-project.supabase.co
     SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
     SUPABASE_JWT_SECRET=your-jwt-secret
     BACKBOARD_API_KEY=your-backboard-key
     BACKBOARD_BASE_URL=https://app.backboard.io/api
     BACKBOARD_ASSISTANT_ID=your-backboard-assistant-id

4. backend/app/config.py
   Pydantic BaseSettings reading those 6 vars from a .env file via
   python-dotenv. Expose a `get_settings()` cached factory using
   functools.lru_cache.

5. backend/app/auth.py
   Implement `get_current_user_id(authorization: str = Header(...))` as
   a FastAPI dependency:
     - Strip "Bearer " prefix
     - jose.jwt.decode with SUPABASE_JWT_SECRET, algorithms=["HS256"],
       audience="authenticated"
     - Return payload["sub"]
     - Raise HTTPException(401) on any decode error or missing claim

6. backend/app/database.py
   `get_supabase()` factory that returns a supabase.Client using
   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Module-level singleton.

7. backend/app/models/schemas.py — IMPLEMENT FULLY
   All Pydantic models (use these exact names and shapes; the frontend
   TypeScript types will mirror them by hand later):

   ApplianceName: Literal["dishwasher","washing_machine","dryer",
                          "ev_charger","water_heater_boost"]
   ApplianceConfig(id: str, name: str, duration: int,
                   powerKw: float, earliestStart: int, latestFinish: int,
                   isNoisy: bool, satisfactionByTime: dict[str, float])
   TimelineSlot(start: datetime, end: datetime, appliance: str,
                cost_usd: float, co2_grams: float, score: float)
   RecommendationOption(label: Literal["best","balanced","convenient"],
                        slot: TimelineSlot,
                        savings_vs_baseline_usd: float,
                        co2_reduction_grams: float,
                        why: str)
   ApplianceRecommendation(appliance: ApplianceName,
                           duration: int, powerKw: float,
                           options: list[RecommendationOption])
   GridMixSnapshot — dict[str, float] of source name → fraction
   SavingsSummary(total_daily_cost_usd: float,
                  estimated_monthly_savings_usd: float,
                  co2_reduction_grams_today: float,
                  co2_reduction_grams_monthly: float)
   DailyRecommendation(date: date,
                       appliances: list[ApplianceRecommendation],
                       hvac_schedule: list[TimelineSlot],
                       grid_mix_now: GridMixSnapshot,
                       totals: SavingsSummary)
   FeedbackEvent(appliance: str, chosen_option: str,
                 response: Literal["yes","no","different_time"],
                 suggested_time: datetime | None = None)
   UserWeights(cost: float, emissions: float, satisfaction: float)
       — validator that asserts cost+emissions+satisfaction approximately 1.0
   ChatRequest(message: str, thread_id: str | None = None)
   ChatResponse(reply: str, thread_id: str,
                sources: list[dict] | None = None)
   ExternalData(prices: list[float],
                carbon: list[float],
                hourly_temp_f: list[float])
       — validator that asserts prices and carbon have length 48, temp has length 24
   DayAvailability(date: date, slots: list[bool])
       — validator that asserts len == 48

8. backend/app/services/external_data.py — IMPLEMENT FULLY (mocked)
   Hardcoded constants at the top:
     PRICES = [
       0.11, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11,
       0.11, 0.11, 0.11, 0.11, 0.20, 0.205, 0.21, 0.215,
       0.22, 0.225, 0.24, 0.237, 0.234, 0.231, 0.229, 0.226,
       0.223, 0.22, 0.217, 0.214, 0.211, 0.209, 0.206, 0.203,
       0.28, 0.294, 0.308, 0.322, 0.336, 0.35, 0.364, 0.378,
       0.392, 0.406, 0.22, 0.21, 0.20, 0.19, 0.18, 0.17
     ]
     CARBON = [
       0.4, 0.398, 0.397, 0.395, 0.393, 0.392, 0.39, 0.388,
       0.387, 0.385, 0.383, 0.382, 0.38, 0.367, 0.355, 0.343,
       0.33, 0.318, 0.305, 0.292, 0.28, 0.27, 0.26, 0.25,
       0.24, 0.23, 0.22, 0.21, 0.20, 0.19, 0.18, 0.20,
       0.22, 0.24, 0.26, 0.28, 0.30, 0.327, 0.353, 0.38,
       0.407, 0.433, 0.46, 0.45, 0.44, 0.43, 0.42, 0.41
     ]
     HOURLY_TEMP_F = [
       68, 67, 66, 65, 65, 66, 70, 75,
       80, 85, 89, 92, 94, 95, 95, 93,
       90, 86, 82, 78, 75, 72, 70, 69
     ]
     GRID_MIX_NOW = {
       "nuclear": 0.22, "gas": 0.40, "wind": 0.18, "solar": 0.12,
       "hydro": 0.05, "coal": 0.03
     }
   Function `get_mock_external_data(zip_code: str, date_iso: str)
   -> ExternalData` that returns the constants wrapped in the model.
   Function `get_grid_mix_now(zip_code: str) -> dict[str, float]`
   that returns GRID_MIX_NOW.
   Top of file comment: "Replace these constants with calls to OpenEI
   / Electricity Maps / OpenWeatherMap when integrating real data —
   the function signatures stay the same."

9. backend/app/routers/external_data.py — IMPLEMENT FULLY
   GET /api/external-data?zip=xxxxx&date=yyyy-mm-dd
   - Depends on get_current_user_id
   - Calls get_mock_external_data
   - Returns ExternalData

10. backend/app/routers/recommendations.py — STUB ONLY for now
    GET /api/recommendations?date=yyyy-mm-dd
    - Depends on get_current_user_id
    - body: raise NotImplementedError("Phase 4")
    - But include the function signature, the docstring describing
      the data flow we agreed on, and import statements.

11. backend/app/routers/feedback.py — STUB ONLY for now
    POST /api/feedback (body: FeedbackEvent)
    - Same: signature, docstring, NotImplementedError

12. backend/app/routers/chat.py — STUB ONLY for now
    POST /api/chat (body: ChatRequest)
    - Same.

13. backend/app/routers/calendar_sync.py — STUB ONLY for now
    POST /api/calendar-sync
    - Same.

14. backend/app/services/scoring.py — STUB
    Function signatures with docstrings, bodies are
    `raise NotImplementedError("Phase 4: implement PuLP")`:
      score_slot(start_slot, appliance, prices, carbon, weights) -> float
      generate_three_options(appliances, prices, carbon, weights,
                             circuit_power_limit, quiet_hours)
                             -> dict[str, list[RecommendationOption]]

15. backend/app/services/adaptation.py — STUB
    update_user_weights(prev: UserWeights, event: FeedbackEvent)
    -> UserWeights
    Body: NotImplementedError.

16. backend/app/services/hvac.py — STUB
    hvac_schedule(outdoor_temps, t_min, t_max, availability)
    -> list[TimelineSlot]
    Body: NotImplementedError.

17. backend/app/services/calendar_parser.py — STUB
    parse_to_availability(events: list) -> list[bool]  # length 48
    Body: NotImplementedError.

18. backend/app/services/backboard_client.py — STUB
    async backboard_chat(user_id, message, thread_id=None)
    -> ChatResponse
    Body: NotImplementedError.

When done, run `uvicorn backend.main:app --reload --port 8000` mentally
through the code and confirm:
  - The app boots
  - GET /health works
  - GET /api/external-data returns real data with a valid JWT
  - All other endpoints are reachable but raise 501-equivalent errors

[APPEND THE UNIVERSAL PROMPT SUFFIX HERE]
```

### Acceptance criteria

- The full `backend/` tree exists.
- `pip install -r backend/requirements.txt` completes cleanly.
- `uvicorn backend.main:app --reload --port 8000` boots without errors.
- `GET /health` returns `{"ok": true}`.
- `GET /api/external-data?zip=85718&date=2026-04-26` with a valid JWT returns the hardcoded ExternalData payload.
- All other routes raise `NotImplementedError` (visible as 500s — that's fine for now).

### What NOT to ask in this phase

- PuLP optimization, adaptation, HVAC, Backboard, calendar parser implementations — all Phase 4.
- Frontend API client — Phase 5.1.
- Tests, Dockerfile, deployment.

---

## Phase 4 — Backend Implementation: PuLP + Services + Routers (1 hr)

This is the algorithmic heart of the build. **Each service gets its own Plan-then-Implement prompt** so Cursor doesn't do the whole thing in one shot and miss your intent on the math. Run them in order: scoring → HVAC → adaptation → calendar parser → Backboard client → wire all routers.

You can compress this to fewer prompts if you're confident, but the per-service plan-first pattern catches drift early.

### 4.1 — PuLP scoring service (20 min)

**Step A — Plan mode in Chat (3 min):**

```text
@PRD.md @.cursorrules @backend/app/models/schemas.py
@backend/app/services/scoring.py

I'm about to implement the PuLP scoring service. Before any code,
plan the math. Specifically:

1. The optimization problem statement, in plain English: given a list of
   appliances (each with duration in 30-min slots, powerKw, earliestStart,
   latestFinish, isNoisy, and satisfactionByTime dictionary mapping slot
   string to float 0.0-1.0), 48-slot prices array, 48-slot carbon array,
   user weights (cost/emissions/satisfaction summing to 1.0), circuitPowerLimit,
   and quietHours (list of slot indices), find the start time for each
   appliance that minimizes the weighted sum of normalized cost, emissions,
   and (1 - satisfaction).

2. Decision variables, objective function, constraints — written as a
   clean LP in PuLP terms.
   - Decision variables: binary variable for each appliance and possible start slot.
   - Constraints:
     - Exactly one start slot per appliance.
     - start slot >= earliestStart.
     - start slot + duration <= latestFinish.
     - If isNoisy, no running slots can intersect with quietHours.
     - For any slot t, sum of powerKw of all running appliances <= circuitPowerLimit.

3. How we'll generate THREE non-overlapping options ("best",
   "balanced", "convenient") from the LP results. My current thinking:
   Since appliances are coupled by the circuit limit, we solve the LP
   three times for the whole house:
     - "best" = pure cost-minimum schedule
     - "balanced" = cost+emissions-weighted minimum schedule
     - "convenient" = pure satisfaction-maximum schedule

4. Edge cases to handle: no feasible schedule exists (relax circuit limit
   or quiet hours as fallback).

5. The exact return shape — a dictionary mapping appliance ID to a list
   of three RecommendationOption objects with `why` strings I can drop
   into the recommendation card UI. Make the `why` text concrete and 1
   sentence each (e.g. "Cheapest schedule" / "Best carbon vs cost balance"
   / "Most convenient for you").

Output as a numbered plan. Do NOT write code yet.
```

Review the plan. Push back on anything that adds complexity (e.g. if Cursor proposes time-coupling between appliances, say no — each appliance is scored independently for the demo).

**Step B — Composer/Agent (15 min):**

```text
Per the plan, implement backend/app/services/scoring.py fully.
Constraints:

- Use PuLP. Import: from pulp import LpProblem, LpMinimize, LpVariable,
  lpSum, LpBinary, PULP_CBC_CMD.
- Use the default CBC solver (PULP_CBC_CMD(msg=False)) — bundled
  with PuLP, no install needed beyond `pip install pulp`.
- Keep the function signatures from the stub:
    score_slot(start_slot, appliance, prices, carbon, weights) -> float
    generate_three_options(appliances, prices, carbon, weights,
                           circuit_power_limit, quiet_hours)
                           -> dict[str, list[RecommendationOption]]
- Type hints on everything. Use the schemas in
  @backend/app/models/schemas.py for return types.
- score_slot computes the weighted cost+emissions for a SPECIFIC start
  slot (no LP needed — just an integral).
- generate_three_options is where the LP lives. Solve three times
  (best, balanced, convenient) for all appliances together to respect
  circuit_power_limit.
- The three returned options per appliance should ideally not overlap
  in time.
- If no feasible window exists for a label, fall back to relaxing
  constraints with a `why` of "Best available given your schedule."
- Cost computation: kWh = (duration/2) * powerKw, then
  cost = sum of (0.5 * powerKw * prices[slot]). CO2 = sum of
  (0.5 * powerKw * carbon[slot]).
- Savings vs baseline: assume baseline = running at the most
  expensive slot of the day. savings_vs_baseline_usd = baseline_cost
  - chosen_cost. Same idea for CO2.

When done, write a tiny standalone main block at the bottom of the
file:
    if __name__ == "__main__":
        from .external_data import get_mock_external_data
        ed = get_mock_external_data("85718", "2026-04-26")
        weights = UserWeights(cost=0.4, emissions=0.2, satisfaction=0.4)
        opts_dict = generate_three_options(
            [ApplianceConfig(id="dishwasher", name="Dishwasher",
                             duration=4, powerKw=1.3, earliestStart=34,
                             latestFinish=44, isNoisy=True,
                             satisfactionByTime={"39": 1.0, "38": 0.946})],
            ed.prices, ed.carbon, weights, 7.2,
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 44, 45, 46, 47]
        )
        for app_id, opts in opts_dict.items():
            for o in opts: print(o.label, o.slot.start, o.savings_vs_baseline_usd)

So I can run `python -m backend.app.services.scoring` and see three
options print. This is for me to sanity-check the math, NOT a test.

[APPEND THE UNIVERSAL PROMPT SUFFIX HERE]
```

After Cursor finishes, run `python -m backend.app.services.scoring` from the repo root and eyeball the output. The "best" option's start hour should be in the 11 AM – 2 PM window where prices are lowest.

### 4.2 — HVAC threshold service (5 min)

**Cursor mode:** Composer/Agent (skip Plan mode — this one is small).

```text
@PRD.md @.cursorrules @backend/app/services/hvac.py
@backend/app/models/schemas.py

Implement backend/app/services/hvac.py per its stub signature:

def hvac_schedule(outdoor_temps: list[float], t_min: int, t_max: int,
                  availability: list[bool], date_iso: str)
                  -> list[TimelineSlot]:

Logic:
- For each of the 24 hours, check outdoor_temps[h].
- If temp > t_max: schedule a "cool" slot at hour h.
- If temp < t_min: schedule a "heat" slot at hour h.
- Otherwise no slot.
- Only schedule slots whose corresponding 30-min availability
  blocks (slots[h*2] OR slots[h*2+1]) are True.
- Each TimelineSlot has start = midnight + h hours, end = +1 hour,
  appliance = "hvac_cool" or "hvac_heat", cost_usd computed from
  price array (caller-provided? — no, just hardcode an estimate of
  3 kWh at $0.15 = $0.45 per cool hour, 4 kWh at $0.15 = $0.60 per
  heat hour for the demo), co2_grams computed similarly with a
  500 g/kWh constant, score = 0.5.

Add a comment at the top noting this is a deliberately simple
threshold model and that a real implementation would couple to
indoor thermal mass and occupancy.

[APPEND THE UNIVERSAL PROMPT SUFFIX HERE]
```

### 4.3 — Adaptation service (5 min)

**Cursor mode:** Composer/Agent.

```text
@PRD.md @.cursorrules @backend/app/services/adaptation.py
@backend/app/models/schemas.py

Implement backend/app/services/adaptation.py:

def update_user_weights(prev: UserWeights, event: FeedbackEvent)
                        -> UserWeights:

Logic — exponential moving average with a small step size (alpha = 0.1):

- If event.response == "yes" and event.chosen_option == "best":
    nudge cost weight up: cost = cost + alpha * (1 - cost),
    then renormalize so all three sum to 1.0
- If event.response == "yes" and event.chosen_option == "balanced":
    nudge emissions weight up by the same rule
- If event.response == "yes" and event.chosen_option == "convenient":
    nudge satisfaction weight up by the same rule
- If event.response == "no":
    no change (we don't have enough signal to know what to nudge
    toward)
- If event.response == "different_time":
    nudge satisfaction weight up slightly (alpha=0.05) — the user's
    schedule mattered more than our suggestion

Always renormalize so cost + emissions + satisfaction = 1.0.
Clamp each weight to [0.05, 0.85] before renormalizing so no weight
collapses to zero.

Add an `if __name__ == "__main__"` block that runs three sample
events and prints the evolution of weights, so I can sanity-check.

[APPEND THE UNIVERSAL PROMPT SUFFIX HERE]
```

### 4.4 — Calendar parser stub (3 min)

**Cursor mode:** Composer/Agent.

```text
@PRD.md @.cursorrules @backend/app/services/calendar_parser.py

Implement parse_to_availability(events: list[dict]) -> list[bool] of
length 48:

- Default all 48 slots to True.
- For each event with `start` and `end` (ISO strings), compute the
  30-minute slot indices it covers and set them to False.
- Out-of-day events are clamped to the day window.

Also implement `default_weekly_availability() -> list[DayAvailability]`
that returns 7 days of availability where:
- Weekdays: 9 AM – 5 PM (slots 18–34) are False (away at work)
- Weekends: all True
This is what /api/calendar-sync returns when the user has no calendar
connected.

[APPEND THE UNIVERSAL PROMPT SUFFIX HERE]
```

### 4.5 — Backboard.io client (REAL integration, 10 min)

**Step A — Plan mode in Chat (3 min):**

```text
@PRD.md @.cursorrules @backend/app/services/backboard_client.py
@backend/app/config.py

Before implementing, search the web for the current Backboard.io API
docs (specifically the chat / messages endpoint). Tell me:

1. The exact endpoint URL for creating a thread from an assistant.
2. The exact endpoint URL for sending a chat message to an existing thread.
3. The auth header format (Bearer token? x-api-key? something else?)
4. The request body shape for message sends, including the per-message
   model override:
     llm_provider = "google"
     model_name = "gemma-4-31b-it"
   (Fallback option if needed: "gemma-4-26b-a4b-it".)
5. How do we enable memory and web_search tools, if those are
   first-class concepts?
6. The response body shape — where is the reply text, the thread_id,
   and any sources?
7. Confirm or correct the BACKBOARD_BASE_URL I have in .env.example.

If anything is unclear from the docs, list the assumptions you'll
make and flag them so I can verify with the team's Backboard
account.

Do NOT write code yet.
```

Review what Cursor finds. If anything looks off, paste the actual Backboard docs into a comment and ask Cursor to align. Once confirmed:

**Step B — Composer/Agent (7 min):**

```text
Per the plan, implement backend/app/services/backboard_client.py
fully. Use httpx.AsyncClient. Read BACKBOARD_API_KEY,
BACKBOARD_BASE_URL, and BACKBOARD_ASSISTANT_ID from get_settings().

Signature stays:
async def backboard_chat(user_id: str, message: str,
                          thread_id: str | None = None) -> ChatResponse:

Behavior:
- If thread_id is not provided, create a Backboard thread first with:
    POST {BACKBOARD_BASE_URL}/assistants/{BACKBOARD_ASSISTANT_ID}/threads
  Then use the returned thread_id for the message.
- Send the user message to:
    POST {BACKBOARD_BASE_URL}/threads/{thread_id}/messages
  with headers:
    {"X-API-Key": BACKBOARD_API_KEY}
  and form data:
    {
      "content": message,
      "llm_provider": "google",
      "model_name": "gemma-4-31b-it",
      "stream": "false",
      "memory": "Auto",
      "web_search": "Auto"
    }
- Do not call Google AI Studio / Gemma directly from FastAPI. The
  team's Google AI Studio key is configured as BYOK inside Backboard.
- Timeout: 30 seconds (Gemma can be slow on cold starts).
- On any error (HTTPError, timeout, JSON decode failure):
    log to stderr and return a graceful ChatResponse with:
      reply = "I'm having trouble reaching the assistant right now.
               Can you try again in a moment?"
      thread_id = thread_id or "fallback"
      sources = None
    Do NOT raise.

Add an `if __name__ == "__main__"` block:
    import asyncio
    async def main():
        r = await backboard_chat("demo_user_42",
                                 "Why is 2 PM the best time today?")
        print(r.reply); print(r.thread_id); print(r.sources)
    asyncio.run(main())

So I can run `python -m backend.app.services.backboard_client` with
real keys in .env and verify the integration works end-to-end before
wiring the router.

[APPEND THE UNIVERSAL PROMPT SUFFIX HERE]
```

After implementing, run the smoke test. If Gemma 4 responds, you're golden. If not, debug *now* — do not let this slip to demo time.

### 4.6 — Wire all routers (15 min)

**Cursor mode:** Composer/Agent. One prompt, all four routers.

```text
@PRD.md @.cursorrules @backend/app/routers/recommendations.py
@backend/app/routers/feedback.py @backend/app/routers/chat.py
@backend/app/routers/calendar_sync.py
@backend/app/services/scoring.py @backend/app/services/hvac.py
@backend/app/services/adaptation.py
@backend/app/services/backboard_client.py
@backend/app/services/calendar_parser.py
@backend/app/services/external_data.py
@backend/app/database.py @backend/app/auth.py
@backend/app/models/schemas.py

The services are all implemented. Now wire the four router stubs
into real handlers.

backend/app/routers/recommendations.py — GET /api/recommendations
1. Read date from query (default: today, ISO).
2. user_id = Depends(get_current_user_id)
3. supabase = get_supabase()
4. profile = supabase.table("profiles").select("*").eq("id", user_id)
              .single().execute().data
   weights = UserWeights(cost=profile["cost_weight"],
                         emissions=profile["emissions_weight"],
                         satisfaction=profile["satisfaction_weight"])
   t_min, t_max = profile["t_min_f"], profile["t_max_f"]
   home_zip = profile["home_zip"] or "85718"
   circuit_power_limit = profile["circuit_power_limit"]
   quiet_hours = profile["quiet_hours"]
5. appliances = supabase.table("appliances").select("*")
                 .eq("user_id", user_id).eq("enabled", True)
                 .execute().data
   (If empty, use a default set of [dishwasher, ev_charger, water_heater_boost]
    with sensible duration/power for the demo.)
6. avail_row = supabase.table("availability").select("*")
                .eq("user_id", user_id).eq("date", date)
                .execute().data
   availability = avail_row[0]["slots"] if avail_row else [True]*48
7. ed = get_mock_external_data(home_zip, date)
8. Call generate_three_options(appliances, ed.prices, ed.carbon,
   weights, circuit_power_limit, quiet_hours) to get opts_dict.
9. Assemble ApplianceRecommendation list from opts_dict.
10. hvac = hvac_schedule(ed.hourly_temp_f, t_min, t_max, availability,
                        date)
11. grid_mix = get_grid_mix_now(home_zip)
12. Compute SavingsSummary totals:
    - total_daily_cost_usd: sum of best-option cost across appliances
    - estimated_monthly_savings_usd: sum of (savings_vs_baseline_usd
      for the user's chosen "best" option per appliance) * 30
    - co2_reduction_grams_today: sum of co2_reduction_grams across
      best options
    - co2_reduction_grams_monthly: above * 30
13. Return DailyRecommendation. No caching for the demo — keep it
    simple.

backend/app/routers/feedback.py — POST /api/feedback
1. user_id = Depends(get_current_user_id)
2. supabase = get_supabase()
3. supabase.table("feedback_events").insert({
     "user_id": user_id,
     "appliance": event.appliance,
     "chosen_option": event.chosen_option,
     "response": event.response,
     "suggested_time": event.suggested_time.isoformat()
                       if event.suggested_time else None
   }).execute()
4. Read current weights from profiles, build UserWeights
5. updated = update_user_weights(prev, event)
6. supabase.table("profiles").update({
     "cost_weight": updated.cost,
     "emissions_weight": updated.emissions,
     "satisfaction_weight": updated.satisfaction
   }).eq("id", user_id).execute()
7. Return {"ok": True, "updated_weights": updated}

backend/app/routers/chat.py — POST /api/chat
1. user_id = Depends(get_current_user_id)
2. response = await backboard_chat(user_id, body.message,
                                    body.thread_id)
3. Return response (already a ChatResponse).

backend/app/routers/calendar_sync.py — POST /api/calendar-sync
1. user_id = Depends(get_current_user_id)
2. (For the demo, skip ICS parsing.) Generate 7 days of default
   availability via default_weekly_availability(). Set the date on
   each starting from today.
3. Upsert each row into the availability table.
4. Return the list[DayAvailability].

After implementing, mentally trace one full request through
GET /api/recommendations and confirm:
  - JWT decode succeeds
  - All Supabase queries use user_id and respect RLS
  - The PuLP options come back with non-overlapping time windows
  - Totals are computed correctly

[APPEND THE UNIVERSAL PROMPT SUFFIX HERE]
```

### Acceptance criteria (Phase 4 overall)

- `python -m backend.app.services.scoring` prints three plausible options.
- `python -m backend.app.services.adaptation` shows weights drifting toward whichever option the simulated user chose.
- `python -m backend.app.services.backboard_client` returns a real Gemma 4 response.
- With the FastAPI server running and a valid JWT, `GET /api/recommendations?date=2026-04-26` returns a full DailyRecommendation with three options per appliance.
- `POST /api/feedback` updates `profiles.cost_weight` (verifiable in the Supabase dashboard).
- `POST /api/chat` round-trips a message through Backboard.io.

---

## Phase 5 — Frontend Components (3 hr 30 min)

Now you switch back to frontend, with a working backend behind you. From here on, **one prompt = one component (or a tightly bundled pair)**.

For every component prompt, append at the bottom:

> *"Reuse the design tokens, fonts, spacing, radii, and shadow system locked in Phase 1 (in tailwind.config.ts and src/index.css). Reuse the typed hooks in `src/hooks/`. Pass through loading, error, and empty states.*"
>
> *[Then append the universal prompt suffix.]*

### 5.1 — Frontend API client + typed hooks (30 min)

**Cursor mode:** Composer/Agent.

```text
@PRD.md @.cursorrules @backend/app/models/schemas.py

Build the frontend API layer that talks to FastAPI.

src/lib/api/types.ts
- TypeScript interfaces mirroring every Pydantic model in
  @backend/app/models/schemas.py:
  ApplianceName, ApplianceConfig, TimelineSlot, RecommendationOption,
  ApplianceRecommendation, GridMixSnapshot, SavingsSummary,
  DailyRecommendation, FeedbackEvent, UserWeights, ChatRequest,
  ChatResponse, ExternalData, DayAvailability
- Use the same field names. Convert datetimes to string (ISO).
- Use string literal unions for the Literal[...] types.

src/lib/api/client.ts
- const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000"
- Helper:
    async function getAuthHeaders(): Promise<Record<string,string>> {
      const { data: { session } } = await supabase.auth.getSession();
      return {
        "Authorization": `Bearer ${session?.access_token ?? ""}`,
        "Content-Type": "application/json"
      };
    }
- export async function getRecommendations(date?: string):
    Promise<DailyRecommendation>
- export async function getExternalData(zip: string, date: string):
    Promise<ExternalData>
- export async function postFeedback(event: FeedbackEvent):
    Promise<{ ok: boolean; updated_weights: UserWeights }>
- export async function postChat(message: string, threadId?: string):
    Promise<ChatResponse>
- export async function syncCalendar():
    Promise<DayAvailability[]>
- Each handles errors by throwing a typed ApiError with status and
  message. Log to console in dev mode only. NO retry logic, NO
  backoff.

src/lib/api/queryKeys.ts
- TanStack Query key factories: e.g.
    qk.recommendations(date) = ["recommendations", date]
    qk.externalData(zip, date) = ["externalData", zip, date]

src/hooks/useRecommendations.ts
- useRecommendations(date?: string) → useQuery wrapping
  getRecommendations. Stale time 60s.

src/hooks/useExternalData.ts
- Same pattern.

src/hooks/useFeedback.ts
- useMutation wrapping postFeedback. On success, invalidate
  qk.recommendations.

src/hooks/useChat.ts
- useMutation wrapping postChat. Returns reply, thread_id, sources.
  Does NOT auto-invalidate anything.

src/hooks/useCalendarSync.ts
- useMutation wrapping syncCalendar.

Add VITE_API_URL=http://localhost:8000 to .env.local.

In src/main.tsx, wrap the app in a QueryClientProvider with a
QueryClient configured: defaultOptions.queries.retry = false,
refetchOnWindowFocus = false (we don't want extra Backboard calls).

[APPEND THE STANDARD COMPONENT SUFFIX HERE]
```

### 5.2 — StatCardsRow (30 min)

```text
@PRD.md @.cursorrules @src/hooks/useRecommendations.ts
@src/lib/api/types.ts

Build the StatCardsRow component for the dashboard. Place it as the
first row of the main content area, directly under the page title.

LAYOUT
Two equal-width stat cards side by side. 24px gap. Standard card
styling (white surface, 16px radius, 24px padding, sh-1 shadow).
Stack vertically below 768px.

Card 1: ESTIMATED MONTHLY SAVINGS
  - Overline label top-left: "ESTIMATED MONTHLY SAVINGS" (#5C5C5C)
  - Display-size metric below the label, pulled from
    totals.estimated_monthly_savings_usd, formatted "$47.20"
    (#1A1A1A)
  - Top-right yellow badge with dark text: "+18% vs last month"
  - Bottom: small inline 14-day bar chart (Recharts) of synthesized
    daily savings (generate plausible values around the daily figure
    for demo). Green bars (#57B756). Date labels at each end
    "14d ago" / "Today".
  - Caption: "Based on your last 14 days of usage."

Card 2: CO2 REDUCTION THIS MONTH
  - Overline label "CO2 REDUCTION THIS MONTH"
  - Display-size metric from totals.co2_reduction_grams_monthly,
    formatted in kg ("12.4 kg")
  - Top-right green badge: "+22% vs last month"
  - Bottom: 14-day bar chart, yellow bars (#FFFE56). Same date labels.
  - Caption: "Equivalent to planting 0.6 trees."

DATA WIRING
useRecommendations() → totals. Loading: shimmer placeholders matching
the card layout (no spinners). Error: small inline error banner
inside the card with retry button.

INTERACTION
Each card is clickable. Click → side sheet (shadcn/ui Sheet) titled
"How we calculate this" with a 2-paragraph plain-language
explanation and a "View raw data" link. Hardcode the explanation
text.

[APPEND THE STANDARD COMPONENT SUFFIX HERE]
```

### 5.3 — DailyTimeline (1 hr, the centerpiece)

**Cursor mode:** Composer with Plan mode.

```text
@PRD.md @.cursorrules @src/hooks/useRecommendations.ts
@src/hooks/useExternalData.ts @src/lib/api/types.ts

Build the DailyTimeline component. This is the most important visual
on the dashboard. Full-width card directly below StatCardsRow.

Plan mode first: lay out the SVG/CSS-grid structure for a
24-hour-wide timeline with 48 30-minute slots, lanes per appliance,
hover tooltips, and the "Now" line. Confirm before implementing.

LAYOUT
Full-width card, 16px radius, 24px padding, sh-1 shadow. Title h3
"Today's Schedule" top-left. Date in body-sm to the right of the
title ("Saturday, April 25"). Top-right: segmented control toggle
with two options "Today" and "Tomorrow", pill-shaped, yellow fill on
the active option.

THE TIMELINE
Horizontally scrollable on mobile, fits viewport on desktop. 24 hour
columns labeled 12 AM, 1 AM, 2 AM, ..., 11 PM along the top. Each
column divided into two 30-minute slots (48 total).

Below the hour ruler, render one horizontal lane per appliance + one
for HVAC. Lane height 56px. Lane label on the left in h4 with the
Material icon (dishwasher → "local_laundry_service",
ev_charger → "electric_car", hvac → "thermostat",
washing_machine → "local_laundry_service", dryer → "dry").

Inside each lane, draw colored blocks for each scheduled slot from
useRecommendations() → appliances and hvac_schedule:
  - "best" block: yellow #FFFE56 fill, dark text label inside
    showing time range and cost ("$0.42")
  - "balanced" block: green #57B756 fill, dark text
  - "convenient" block: outlined block (2px green border, white fill,
    green text)
  - HVAC cool blocks: light blue tint #E3F2FD with #1976D2 border
  - HVAC heat blocks: light orange tint #FFF8E1 with #F9A825 border

Hover any block → tooltip with appliance name, exact start-end time,
cost, CO2 grams, and the `why` string from the slot. Click a block
→ smooth-scroll to the matching recommendation card in 5.4.

GRID OVERLAYS
Behind the lanes, render two faint background tints driven by the
prices and carbon arrays from useExternalData():
  - Vertical stripes shaded red where price is in the top quartile
  - Vertical stripes shaded green where carbon is in the bottom
    quartile
  Both at 8% opacity so they hint without distracting.

A "Now" line: vertical 2px yellow line spanning all lanes at the
current hour, with a small yellow dot at the top labeled "Now".

EMPTY / LOADING / ERROR
Loading: lane scaffolding with shimmer blocks.
Empty: centered message "No appliances configured. Add one in
Settings." with a primary button "Add Appliance".
Error: full-card error state with retry.

[APPEND THE STANDARD COMPONENT SUFFIX HERE]
```

### 5.4 — RecommendationCardSet (45 min, the commit moment)

```text
@PRD.md @.cursorrules @src/hooks/useRecommendations.ts
@src/hooks/useFeedback.ts @src/lib/api/types.ts

Build the RecommendationCardSet component. Renders below the
timeline, as a vertically stacked list of "appliance sections" — one
section per enabled appliance. Each section: appliance name as h2
with Material icon to its left, body-sm subtitle to its right
showing duration and power ("2 hr · 1.8 kW"). 16px gap below the
heading, then a row of three cards with 16px gaps. Stack vertically
below 900px.

EACH CARD (280px min-width)
Standard card styling. Three regions stacked top to bottom, 16px
gaps:

Region 1 — Header
  Pill badge top-left in overline:
    "BEST" → yellow fill, dark text
    "BALANCED" → green fill, dark text
    "CONVENIENT" → white fill, 2px green border, green text
  Time range in h3 right-aligned: "2:00 PM – 3:30 PM"

Region 2 — Metrics grid (3 columns)
  Cost: small label "Cost", h4 value "$0.38"
  Saves: small label "Saves", h4 value in green "$0.62"
  CO2: small label "CO2 saved", h4 value "184 g"

Below the metrics, the `why` string from the option in body-sm
italicized, secondary text color.

Region 3 — Action row (3 buttons, 8px gap, full-width row)
  Primary "Use this time" (black fill, white text, fills available
    width minus the two icon buttons)
  Ghost icon button "thumb_down" Material icon
  Ghost icon button "schedule" Material icon

INTERACTION
- Click "Use this time" → useFeedback().mutate({appliance, response:
  "yes", chosen_option: <label>}). Optimistically tick up the
  StatCardsRow savings via TanStack Query setQueryData. Fade the
  other two cards in the section to 50% opacity with a small "Not
  selected" ribbon. The hook's onSuccess will already invalidate
  recommendations so the timeline re-renders.
- Click thumb_down → mutate({response: "no", chosen_option:
  <label>}). Card visually marked dismissed (gray border,
  strike-through time).
- Click schedule icon → open shadcn/ui Dialog with a native time
  input. On confirm, mutate({response: "different_time",
  suggested_time: <ISO>, chosen_option: <label>}).

After any feedback action, show a toast bottom-right: "Got it — I'll
remember this for next time." (yellow accent bar on the left, 3s
auto-dismiss).

[APPEND THE STANDARD COMPONENT SUFFIX HERE]
```

### 5.5 — GridMixWidget (30 min, the energy-track bonus hook)

```text
@PRD.md @.cursorrules @src/hooks/useRecommendations.ts
@src/lib/api/types.ts

Build the GridMixWidget component. Place it as a sidebar widget on
the right side of the dashboard, above the chat panel. Width: 320px
on desktop. On mobile, render as a full-width card below the
timeline.

LAYOUT
Standard card. Title h3 "Grid Mix Right Now" top-left. Caption to
the right showing the grid region from the user's profile zip
("Tucson, AZ · TEP" — hardcode from a tiny zip→region lookup map
inside the component; we don't have a real region API). 6px green
dot with 2s pulse animation next to the caption.

VISUAL
Horizontal stacked bar, 32px tall, full card width, divided into
segments proportional to grid_mix_now from useRecommendations().
Segment colors:
  nuclear: #FFFE56 (yellow — hero color, the demo hook)
  solar:   #F9A825
  wind:    #57B756
  hydro:   #1976D2
  gas:     #8A8A8A
  coal:    #1A1A1A
  oil:     #5C5C5C
  other:   #B0B0B0

Below the bar, 2-column legend listing each source with color
swatch, percentage, and Material icon. Sort descending by
percentage. Highlight the nuclear row with a thin yellow border and
a small "Zero-carbon" pill badge.

Below the legend, a one-sentence body-sm summary generated
client-side from the percentages with a small pure function:

  function getGridMixSummary(mix: Record<string, number>): string {
    const renewable = (mix.solar ?? 0) + (mix.wind ?? 0)
                      + (mix.hydro ?? 0);
    const zeroCarbon = renewable + (mix.nuclear ?? 0);
    const nuclearPct = Math.round((mix.nuclear ?? 0) * 100);
    const renewablePct = Math.round(renewable * 100);
    if (zeroCarbon > 0.5) {
      return `Right now, ${nuclearPct}% of your electricity is
        nuclear and ${renewablePct}% is renewable — that's a great
        window for high-power tasks.`;
    }
    return `Grid carbon is elevated right now (${nuclearPct}%
      nuclear, ${renewablePct}% renewable). Consider shifting
      flexible loads to midday.`;
  }

INTERACTION
Card is clickable. Click → side sheet with a 24-hour line chart of
carbon intensity for today (Recharts, fed from useExternalData), the
current hour marked, and a paragraph explaining how renewable mix
typically peaks midday.

[APPEND THE STANDARD COMPONENT SUFFIX HERE]
```

### 5.6 — SavingsImpactPanel + ChatPanel (30 min, in one prompt)

```text
@PRD.md @.cursorrules @src/hooks/useRecommendations.ts
@src/hooks/useChat.ts

Build TWO components. Keep them in separate files but build in one
prompt.

===============================================================
COMPONENT A — SavingsImpactPanel (src/components/dashboard/
                                  SavingsImpactPanel.tsx)
===============================================================

Pin to the bottom of the main content column as a tall card
spanning full width.

CONTENT
Title h2 "Your Impact" top-left. Caption to the right "Updates as
you choose recommendations".

A 4-column metric grid (stacks to 2 columns at 768px, 1 column at
480px):
Each cell: Overline label, Display-size value, small caption
underneath.

Cells (pull from useRecommendations() → totals):
  1. TODAY'S COST  →  "$3.42"  →  "vs $4.81 baseline"
  2. MONTHLY SAVINGS →  "$47.20" →  "projected"
  3. CO2 TODAY  →  "486 g" →  "saved vs baseline"
  4. CO2 MONTHLY  →  "12.4 kg" → "= 0.6 trees planted"

Below the grid: thin horizontal progress bar (height 8px, radius
4px, yellow fill on light gray track) labeled "Monthly Goal: $60
saved" with the percentage filled rendered as text on the right.

ANIMATION
When the user commits a recommendation in 5.4, the cost number
ticks down and the savings number ticks up using a 600ms ease-out
animation. Use react-countup.

===============================================================
COMPONENT B — ChatPanel (src/components/chat/ChatPanel.tsx)
===============================================================

Pinned bottom-right of the dashboard, 320px wide on desktop. On
mobile, render as a floating action button (yellow 56px circle with
chat bubble Material icon) bottom-right that expands to a
full-screen sheet on tap.

LAYOUT (desktop pinned panel)
Card styling. Header row 56px tall:
  - "EnerGenius Assistant" in h4
  - Green dot + body-sm "Online · remembers your prefs"
  - Ghost icon button on the right (minimize/expand)

Messages region: vertically scrolling, 12px padding, oldest top,
newest bottom. Auto-scroll on new message. Two bubble styles:
  - User: right-aligned, 12px radius, dark fill #1A1A1A, white
    text, max 75% width.
  - Assistant: left-aligned, 12px radius, white fill, 1px #E0E0E0
    border, dark text, max 85% width. Below the bubble, small
    caption showing sources if present (linked titles separated
    by " · ").

Input row 56px tall:
  - Auto-grow textarea (max 3 lines), placeholder "Ask anything
    about your energy..."
  - 40px circular send button on the right, yellow fill, dark
    "arrow_upward" icon. Disabled while a request is in flight
    (small spinner inside the button).

DATA WIRING
Use useChat() from src/hooks. On send, call
mutation.mutate({message, threadId}). THIS IS A REAL CALL TO
BACKBOARD.IO + GEMMA 4 (routed through FastAPI) — show an assistant
"thinking..." placeholder bubble with three pulsing dots while
waiting (Backboard responses can take 2–4 seconds; the indicator is
real, not theater). On error, show a red caption under the input
"Connection hiccup — try again" and a Retry ghost button.

PRESET PROMPTS
Above the input row, three pill chips that auto-fill the input on
tap:
  - "Why is 2 PM the best time today?"
  - "Don't run the dishwasher before 9 AM"
  - "What's grid carbon doing tomorrow?"

The first message in a fresh thread is a hardcoded assistant
greeting:
"Hi — I'm your energy assistant. I remember your preferences across
sessions. Ask me anything about today's recommendations."

PERSISTENCE
Persist the active thread_id in a Zustand store at
src/stores/chatStore.ts keyed by user_id, persisted to localStorage
via zustand/middleware/persist. The thread_id is whatever the
/api/chat endpoint returns from Backboard.

[APPEND THE STANDARD COMPONENT SUFFIX HERE]
```

### 5.7 — Onboarding Wizard + Settings (30 min combined)

**Two prompts, run back to back.**

**Prompt A — Onboarding (5 screens):**

```text
@PRD.md @.cursorrules @src/lib/supabase.ts
@src/hooks/useCalendarSync.ts

Build the Onboarding wizard at /onboarding. Trigger when the user's
profile row has no home_zip (already wired by ProtectedRoute in
Phase 2). Five screens, each a full-page centered layout with a
thin yellow progress bar at the top showing "Step N of 5".

PER-SCREEN STYLING
- 18px body for questions, 32px (h1) for screen title.
- 32px above each question, 48px between question and inputs.
- Inputs 56px tall on screens 1 and 2, 48px elsewhere.
- Primary "Next" button: large size (56px), pill, fills 240px,
  bottom-center.
- Inline validation: green check icon appears when input becomes
  valid.
- Slide transition: 200ms ease-in-out horizontal slide.
- Friendly error copy ("That doesn't look like a valid zip — five
  digits, please.").

SCREEN 1 — WELCOME + NAME + ZIP
Title: "Hi! Let's set up your home."
Subtitle (body-lg, secondary): "We'll use this to find your local
electricity prices and grid carbon."
Two inputs: "Your name" (min 2 chars) and "Home zip code"
(5 digits).

SCREEN 2 — COMFORT RANGE
Title: "What's your comfort range?"
Subtitle: "We'll only run heating or cooling outside this range."
Dual-thumb range slider 60°F to 85°F (shadcn/ui Slider). Default
thumbs at 68 and 76. Live label above ("68°F – 76°F"). Yellow track
between thumbs.

SCREEN 3 — APPLIANCES
Title: "Which appliances should we schedule?"
Subtitle: "Toggle the ones you have, then set duration and power."
Five rows, one per appliance (dishwasher, washing_machine, dryer,
ev_charger, water_heater_boost). Each row: yellow shadcn Switch on the
left, name + Material icon, two compact inputs labeled "Duration
(slots)" and "Power (kW)" with sensible defaults (dishwasher 4/1.3,
washer 3/0.9, dryer 2/2.4, EV 8/1.9, water heater 4/2.0).
Disabled rows dim to 50%.

SCREEN 4 — PRIORITIES
Title: "What matters most?"
Subtitle: "Drag to reorder. Top = most important."
Vertical drag-and-drop list with three items: "Save money", "Reduce
emissions", "Stay convenient". Use @dnd-kit/core (install if needed).
Each item: a card with a drag handle, icon, and short description.
Behind the scenes: top item gets weight 0.5, middle 0.3, bottom 0.2.

SCREEN 5 — CALENDAR
Title: "Connect your calendar (optional)"
Subtitle: "We'll schedule appliances around your real availability."
Two large stacked buttons: "Connect Google Calendar" (primary) and
"Skip for now" (ghost). Google button calls supabase.auth with the
calendar.readonly scope; on success, calls useCalendarSync().mutate()
(which currently returns the stubbed 7-day default availability —
that's fine for the demo). Show a green success state with a check
icon if sync succeeds.

SUBMIT
On the final "Get Started" tap, write to profiles (full_name,
home_zip, t_min_f, t_max_f, cost_weight, emissions_weight,
satisfaction_weight) and appliances (one row per enabled). Then
route to /dashboard.

[APPEND THE STANDARD COMPONENT SUFFIX HERE]
```

**Prompt B — Settings:**

```text
@PRD.md @.cursorrules @src/lib/supabase.ts

Build a Settings page at /settings. Three tabbed sections (shadcn/ui
Tabs):

Tab 1 — Profile
  Edit name, zip, comfort range. Same input styles as onboarding.
  Save button updates the profiles row.

Tab 2 — Appliances
  Same row layout as Onboarding Screen 3, plus an "Add appliance"
  button at the bottom that inserts a new row in the appliances
  table.

Tab 3 — Priorities
  Same drag-and-drop as Onboarding Screen 4. Below it, three numeric
  readouts showing the live weights ("Cost: 0.50 · Emissions: 0.30 ·
  Satisfaction: 0.20"). Add a "Reset to AI-adapted weights" button that
  refetches the profile from Supabase (since the feedback loop
  updates weights server-side).

Save changes per tab independently. Show a yellow "Unsaved changes"
pill in the top-right of the page while there are pending edits.

[APPEND THE STANDARD COMPONENT SUFFIX HERE]
```

---

## Phase 6 — Demo Mode + State Audit (15 min)

```text
@PRD.md @.cursorrules @src/lib/api/client.ts

Add a Demo Mode toggle and audit all components for state coverage.

DEMO MODE
Add a "DEMO" pill chip in the top bar (yellow fill, dark text;
ghost when off). When ON, every function in src/lib/api/client.ts
short-circuits and returns hardcoded data from
src/lib/api/demoFixtures.ts instead of calling FastAPI.

EXCEPTION: leave the chat call going to the real FastAPI /api/chat
endpoint (which proxies to Backboard.io) even when Demo Mode is on.
The real chat is a key demo moment and we want it live. Add a
SECOND toggle "Demo Chat" (separate, off by default) that, when on,
short-circuits chat to a hardcoded reply about midday solar.

Generate src/lib/api/demoFixtures.ts with hand-tuned, demo-perfect
responses for every endpoint:
  - getRecommendations: a clean schedule that visually fills the
    timeline with three appliances at varied times of day
    (dishwasher 2 PM, washer 11 AM, EV charger 1 AM) plus 4 HVAC
    slots. grid_mix_now with nuclear 0.22 prominent. Totals
    showing $47.20 monthly savings, 12.4 kg CO2.
  - getExternalData: smooth, narratively-clear price/carbon/temp
    curves that match the constants in
    @backend/app/services/external_data.py.
  - postFeedback: instant success, returns updated_weights nudged
    toward the chosen option.
  - syncCalendar: seven days of plausible availability (weekdays
    9–5 unavailable, weekends fully available).

Persist the demo-mode flag and demo-chat flag in localStorage.
The DEMO toggle pulses a faint yellow glow when active.

STATE AUDIT
For each component (StatCardsRow, DailyTimeline,
RecommendationCardSet, GridMixWidget, SavingsImpactPanel,
ChatPanel, Onboarding inputs), confirm each handles three states:
  loading → shimmer matching the final shape (no spinners). 1.5s
            subtle shimmer animation.
  error   → inline banner, light red bg, dark red text, small alert
            icon, retry button. Never a raw stack trace.
  empty   → centered message + icon + one-sentence explanation +
            primary CTA to resolve the empty state.

Confirm the top-level <ErrorBoundary> from Phase 2 is still wrapping
the dashboard route.

[APPEND THE UNIVERSAL PROMPT SUFFIX HERE]
```

### Acceptance criteria

- Toggling DEMO on instantly populates every chart with fixture data, no network calls except chat.
- Toggling DEMO off restores live FastAPI calls.
- Killing the FastAPI server with DEMO on causes no UI breakage.
- Refreshing the page preserves the DEMO state via localStorage.

---

## Phase 7 — End-to-End Test + Polish + Demo Script (30 min)

### 7.1 — Manual end-to-end smoke (10 min, no Cursor)

1. Both servers running: `npm run dev` and `uvicorn backend.main:app --reload --port 8000`.
2. Sign up with a fresh email. Confirm onboarding flows through all 5 screens.
3. Land on dashboard. Confirm:
  - StatCardsRow shows real numbers from the backend.
  - DailyTimeline shows three appliances + HVAC.
  - RecommendationCardSet shows three options per appliance with non-overlapping windows.
  - GridMixWidget shows the yellow nuclear segment prominently.
  - SavingsImpactPanel shows totals matching StatCardsRow.
4. Click "Use this time" on a "best" option. Watch savings tick up. Toast appears.
5. Refresh the page. Confirm the savings tick persisted (because feedback updated weights).
6. Open chat. Send "Why is 2 PM the best time today?" Confirm Gemma 4 responds within 5 seconds.
7. Toggle DEMO mode on. Confirm UI doesn't break.
8. Toggle dark mode. Confirm every surface, text, and shadow swaps cleanly.

If any step fails, fix it now — there is no Phase 8.

### 7.2 — Cursor prompt: cosmetic polish pass (10 min)

```text
@PRD.md @.cursorrules

Cosmetic polish pass — quick wins only, no logic changes:

1. Typography hierarchy: scan every page, look for places where two
   adjacent headings are too close in size. Bump one up or down by
   one step in the type scale.
2. Spacing rhythm: open the dashboard mentally, verify section gaps
   are one of {16, 24, 32, 48, 64}. Snap any odd values.
3. Empty state copy: cut every empty-state message to one sentence
   + one CTA. No two-paragraph empty states.
4. Toast timing: confirm toasts auto-dismiss in 3 seconds.
5. Mobile timeline: at 375px viewport, hour columns must remain
   readable. If not, reduce hour-label font size by 1 step on mobile
   only.
6. Yellow contrast audit: confirm no white text ever sits on yellow
   #FFFE56. Audit hover, focus, active states.
7. Dark mode audit: open every page in dark mode, confirm no
   surfaces are accidentally pure white.

For each issue found, list the file and the change you'd make as a
short bullet list, then apply them. Do NOT do unrelated refactors.

[APPEND THE UNIVERSAL PROMPT SUFFIX HERE]
```

### 7.3 — Demo script + README + backup video (10 min)

Create `DEMO.md` at repo root with the 90-second demo script:

```
0:00–0:10  Open dashboard. Camera lingers on the GridMixWidget. Say:
           "Right now 22% of our grid is nuclear. EnerGenius
           highlights zero-carbon windows in real time."

0:10–0:30  Point to the timeline. "Three appliances scheduled across
           the day — dishwasher midday when solar is peaking, EV
           charger overnight when prices bottom out. Our PuLP
           optimization algorithm weighs cost, carbon, and the user's
           comfort preferences using linear programming."

0:30–0:55  Click a "Use this time" card. Watch the savings number
           tick up. "Each click is a feedback signal — over time the
           system adapts to what each user actually values."

0:55–1:20  Open the chat panel. Tap "Why is 2 PM the best time
           today?" Wait for Gemma 4 to respond via Backboard. Read
           the answer aloud. "It uses Gemma 4 with persistent memory
           — it remembers your preferences across sessions and can
           pull in live web context."

1:20–1:30  Show the GridMixWidget one more time. "And the bonus is
           the grid mix view — a homeowner can finally see when
           their neighborhood is running on nuclear, wind, and solar
           versus gas. That's the part that scales beyond one home."
```

Update `README.md` to a tight 3-paragraph project description + setup instructions covering both frontend (`npm run dev`) and backend (`uvicorn backend.main:app --reload`).

Record a 60-second screen capture as a backup. If the live demo dies, cut to the video.

---

## Critical Reminders for Every Cursor Prompt

These are the rules that keep the build on track. Re-read before pasting any prompt.

1. **Plan before code.** For multi-file work, start in Plan mode in Chat. Cursor proposes, you confirm, then it edits. This single habit catches drift before it costs credits.
2. **One component or service per prompt.** Never ask for "the dashboard" or "the recommendation flow." Ask for the StatCardsRow, then the DailyTimeline, then the RecommendationCardSet. Same for backend services.
3. `**@`-mention aggressively.** `@PRD.md`, `@.cursorrules`, `@backend/app/models/schemas.py`, `@src/lib/api/types.ts`. The more specific the context, the less Cursor improvises.
4. **Real content, never lorem ipsum.** Metrics, copy, and labels in this PRD are the real content. Use them verbatim.
5. **Atomic vocabulary.** Buttons, cards, badges, chips, sheets, toasts, modals — name the primitive every time. Don't say "a section with controls."
6. **Buzzwords every time.** Open every component prompt with "Professional, data-rich, energy-tech aesthetic" so style stays cohesive.
7. **Anti-pattern reminder every time.** The universal prompt suffix is non-negotiable, and `.cursorrules` is the safety net. If Cursor starts adding JWT, MFA, retry-with-backoff, observability, or tests, paste the rules back at it and re-prompt.
8. **Real where it matters, mock where it doesn't.** Backboard chat, frontend wiring, PuLP, adaptation, HVAC — all real. External market data is mocked because we don't have time to integrate three APIs.
9. **Edit, don't re-prompt.** When tweaking a component, use Cmd-K (or Ctrl-K) for inline edits with precise change requests ("change CTA text to 'Use this time'") instead of regenerating the file.
10. **Version with intent.** Commit to git after every working phase. `git commit -m "phase 4.1: PuLP scoring service working"`. If Cursor mangles a file, `git checkout` is your friend.
11. **Demo Mode is non-negotiable.** Phase 6 must work before demo. Wi-Fi will fail. The fixtures are your safety net. (Real chat stays live even in Demo Mode.)
12. **The grid mix widget is the bonus-track hook.** Visible in the first 10 seconds of the demo. Yellow nuclear segment is what unlocks the energy-systems bonus consideration.
13. **Smoke-test the backend services from the CLI.** `python -m backend.app.services.scoring`, `.adaptation`, `.backboard_client`. These are not tests — they're sanity checks. Ten seconds saved here is hours saved at demo time.
14. **You're the architect, Cursor is the implementer.** Push back when Cursor's plan adds complexity. The vibe-coder discipline is *knowing what you don't want*.

---

## Appendix A — File Tree (Final State)

```
.cursorrules
PRD.md
DEMO.md
README.md
src/
├── lib/
│   ├── supabase.ts
│   └── api/
│       ├── client.ts
│       ├── types.ts
│       ├── queryKeys.ts
│       └── demoFixtures.ts
├── hooks/
│   ├── useSession.ts
│   ├── useRecommendations.ts
│   ├── useExternalData.ts
│   ├── useChat.ts
│   ├── useFeedback.ts
│   └── useCalendarSync.ts
├── components/
│   ├── dashboard/
│   │   ├── StatCardsRow.tsx
│   │   ├── DailyTimeline.tsx
│   │   ├── RecommendationCardSet.tsx
│   │   ├── GridMixWidget.tsx
│   │   └── SavingsImpactPanel.tsx
│   ├── chat/ChatPanel.tsx
│   ├── onboarding/Wizard.tsx
│   ├── settings/SettingsPage.tsx
│   └── shell/{Sidebar,TopBar,ProtectedRoute,ErrorBoundary}.tsx
└── stores/
    ├── chatStore.ts
    └── themeStore.ts

backend/
├── main.py
├── requirements.txt
├── .env.example
├── app/
│   ├── __init__.py
│   ├── config.py
│   ├── auth.py
│   ├── database.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── recommendations.py
│   │   ├── feedback.py
│   │   ├── chat.py
│   │   ├── calendar_sync.py
│   │   └── external_data.py
│   └── services/
│       ├── __init__.py
│       ├── scoring.py            (PuLP, REAL)
│       ├── adaptation.py         (REAL)
│       ├── hvac.py               (REAL, threshold model)
│       ├── calendar_parser.py    (REAL, ICS parser + defaults)
│       ├── backboard_client.py   (REAL, Backboard.io + Gemma 4)
│       └── external_data.py      (MOCKED with hardcoded curves)

supabase/
└── migrations/
    └── 0001_init.sql
```

---

## Appendix B — Real vs Mock (Cheat Sheet)


| Module                                     | Status                   | Why                                                                                  |
| ------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------ |
| Frontend components, hooks, types          | **Real**                 | Cursor implements                                                                    |
| Auth (Supabase email + Google OAuth)       | **Real** (defaults only) | Supabase handles it; frontend uses helper                                            |
| Database schema + RLS                      | **Real**                 | Supabase handles it                                                                  |
| `backend/app/auth.py` (JWT verify)         | **Real**                 | Cursor implements with python-jose                                                   |
| `backend/app/database.py`                  | **Real**                 | supabase-py service-role client                                                      |
| `backend/app/services/scoring.py`          | **Real (PuLP)**          | Cursor implements LP optimization                                                    |
| `backend/app/services/adaptation.py`       | **Real**                 | Cursor implements EMA weight update                                                  |
| `backend/app/services/hvac.py`             | **Real**                 | Cursor implements threshold model                                                    |
| `backend/app/services/calendar_parser.py`  | **Real**                 | Cursor implements ICS parser + defaults                                              |
| `backend/app/services/backboard_client.py` | **Real**                 | Backboard.io + Gemma 4, key demo moment                                              |
| `backend/app/services/external_data.py`    | **Mocked inline**        | OpenEI / Electricity Maps / OpenWeatherMap take too long; hardcoded realistic curves |
| All 5 routers                              | **Real**                 | Cursor wires DB + services + auth                                                    |


**The honest pitch:** "We integrated Backboard.io with Gemma 4 for a chat agent that has persistent memory and live web search. Our PuLP-based optimization algorithm uses linear programming to weigh cost, carbon, and comfort against hourly market data. We're using mocked market data for the demo since the three external APIs take longer than 8 hours to integrate, but the architecture is one function swap away from being live. The FastAPI backend gives us a clean separation between the React frontend and the Python optimization layer, all driven by Supabase auth and Postgres with row-level security."

---

## Appendix C — Demo Day Hedges

- Pre-record a 60-second screen capture of the dashboard **before** judging.
- 30 minutes before demo, toggle Demo Mode ON for the recommendations/external-data/feedback/calendar paths. **Leave chat on the real Backboard endpoint** — the live LLM moment is the strongest part of the demo.
- Verify Backboard + Gemma 4 is responsive 5 minutes before the demo by sending one of the preset prompts. If it's slow, flip the "Demo Chat" toggle to use the hardcoded "midday solar" reply.
- Confirm FastAPI is running (`uvicorn backend.main:app --port 8000`) before the demo starts. Add `--log-level warning` so console noise doesn't distract on the projector.
- Open the dashboard with the **GridMixWidget visible in the first 10 seconds**. The yellow nuclear segment is the visual that hooks the energy-track bonus.
- Brief one teammate (or your demo partner) to ask the chat agent live: *"Why is 2 PM the best time today?"* — the Backboard memory + web-search response is where the AI agent shines.
- Have the laptop on charger, Wi-Fi tethered to a phone hotspot as backup.
- If the live demo dies, cut to the screen capture without breaking eye contact with the judges. Don't apologize. Keep narrating.

---

## Appendix D — Cursor Workflow Cheat Sheet


| When you want to…                         | Use                                         |
| ----------------------------------------- | ------------------------------------------- |
| Plan a multi-file feature before editing  | Cmd-L (Chat) → "Plan mode: …"               |
| Apply a multi-file change                 | Cmd-I (Composer)                            |
| Tweak a single line / variable / prop     | Cmd-K (inline edit) at the cursor           |
| Pull a file into context                  | `@filename` in the prompt                   |
| Pull the whole codebase                   | `@codebase` (use sparingly — large context) |
| Pin project rules across all prompts      | `.cursorrules` at repo root                 |
| Pin per-folder rules                      | `.cursor/rules/*.mdc` files                 |
| Reference docs (e.g., FastAPI, PuLP)      | `@docs` (Cursor docs index) or paste a URL  |
| Roll back a bad edit                      | `git checkout file.py` (commit often!)      |
| Re-run a prompt with stronger constraints | Edit the prompt in chat, regenerate         |


**Commit cadence:** after every successful phase. Bad edits are fast to undo if the previous good state is one `git reset` away.