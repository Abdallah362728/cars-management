<div align="center">

<img src="docs/banner.svg" alt="Cars Manager — Fuel, Costs, Maintenance" width="100%">

<br>

**A blueprint-styled, offline-capable web app for tracking a car's fuel economy, running costs, and maintenance schedule — where every number is _measured_, not guessed.**

<br>

![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-ES_Modules-E8A33D?style=for-the-badge&labelColor=0E141C)
![No Build Step](https://img.shields.io/badge/Build-none-58B573?style=for-the-badge&labelColor=0E141C)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-5A8DC8?style=for-the-badge&labelColor=0E141C)
![PWA](https://img.shields.io/badge/PWA-installable-D9E2EC?style=for-the-badge&labelColor=0E141C)
![Tests](https://img.shields.io/badge/tests-24_passing-58B573?style=for-the-badge&labelColor=0E141C)

</div>

---

## Overview

Cars Manager is a single-page **Progressive Web App** for people who want to know the _real_ cost and efficiency of their car — not the sticker figure, but what the odometer and the receipts actually say. It runs entirely in the browser as native ES modules (no bundler, no framework), stores data in **Supabase (Postgres)**, and installs to the home screen like a native app.

The interface is built around an **engineer's-blueprint** aesthetic — deep navy field, amber hairlines, monospace annotations, and a schematic side-view of the car as the dashboard hero.

<div align="center">

|  🏠 Dashboard  |  ⛽ Fuel log  |  💶 Costs  |  🔧 Service |
|:---:|:---:|:---:|:---:|
| Live KPIs, efficiency trend, monthly spend, total cost of ownership | Ledger of every fill with per-leg L/100 km & €/100 km | Maintenance, supplies, insurance, registration & more — grouped by month | Recurring service schedule with overdue / due-soon status |

</div>

---

## Highlights

- **⛽ Honest fuel economy** — a rigorously-defined _forward attribution_ model (see below) turns messy real-world fill-ups into trustworthy L/100 km numbers.
- **🧮 Partial fills, handled properly** — top-ups don't corrupt your averages; they get flagged, per-leg estimates while full tanks give exact measurements.
- **💶 True cost of ownership** — purchase price **+** fuel **+** every recorded cost, not just the ones that are easy to add up.
- **📴 Offline-first PWA** — a service worker keeps the app usable without signal and installs it to your phone.
- **🧪 Unit-tested domain** — all the tricky math lives in pure, framework-free functions with **24 `node:test` tests**.
- **🚫 Zero build** — the source files _are_ the deploy artifact. Clone, serve, done.

---

## The fuel methodology

The interesting problem this app solves is: *given a pile of fuel receipts and odometer readings, what does the car actually consume?* The answer is subtler than it looks.

> **Forward attribution.** The fuel you add at a fill powers the distance you drive **until your next fill** — not the leg since the previous one. A fill's consumption is *its own* litres ÷ the leg to the *next* fill.

```
   fill A (full)          fill B (partial)        fill C (full)
      │                        │                       │
      ├────── leg A ──────────►├─────── leg B ────────►│
      │                        │                       │
   litres_A / km(A→B)      litres_B / km(B→C)      pending (no next fill yet)
   = measured L/100km      = flagged estimate       = no number yet
```

- **Full tanks** close a measurement period and yield an **exact** L/100 km.
- **Partial fills** get a **proportional leg estimate** (litres ÷ km × 100), shown as a `~x.x EST` pill and a hollow chart point — never silently averaged in.
- The **newest fill is "pending"**: its fuel is still in the tank, so it has no number until you fill again.
- Distance and monthly-spend stats stay **pure odometer & euro math** — estimates never leak into them.

Every rule here is documented and regression-tested in [`js/domain/fuel-metrics.js`](js/domain/fuel-metrics.js) and [`tests/fuel-metrics.test.js`](tests/fuel-metrics.test.js).

---

## Architecture

The code is layered so that the hard logic is pure and testable, and nothing above it can smuggle a DOM node or a network call into the math.

```mermaid
flowchart TD
    subgraph UI["🖼️  js/ui — views"]
        Pages["pages/<br/>dashboard · fuel · costs · additional"]
        Comps["components/<br/>charts · modal · schematic · toast"]
    end
    subgraph CORE["🧭  js/core — app shell"]
        Router["router.js<br/><i>render-epoch guard</i>"]
        State["state.js<br/><i>active car</i>"]
    end
    subgraph DOMAIN["🧮  js/domain — pure logic (tested)"]
        Fuel["fuel-metrics.js"]
        Costs["costs.js"]
        Sched["schedule.js"]
        Fmt["format.js"]
    end
    subgraph DATA["🗄️  js/data — repositories"]
        Repos["cars · fuel · costs · maintenance<br/>+ supabase-client"]
    end
    DB[("Supabase<br/>Postgres")]

    Pages --> Comps
    Pages --> Router
    Router --> State
    Pages --> DOMAIN
    Pages --> Repos
    Repos --> DB
    DOMAIN -.->|no DOM, no network| DOMAIN
```

**Key design decisions**

| Decision | Why |
|---|---|
| **Render-epoch router** | Every navigation bumps an epoch; async page renders check `isStale(epoch)` after each `await` before touching the DOM — a slow response from a previous car can never draw a chart into a canvas that no longer exists. |
| **Pure domain layer** | No DOM, no Supabase — just numbers in, numbers out. This is what makes 24 fast unit tests possible without a browser. |
| **Numerics coerced at the boundary** | Supabase `numeric` columns arrive as strings; they're `Number()`-coerced once in the repo/normalize step so downstream math never sees a string. |
| **Hand-written CSS token system** | One `tokens.css` file is the single source of truth for the blueprint theme; no Tailwind, no CSS framework. |

---

## Project structure

```
cars-management/
├── index.html              # App shell: nav, FAB, modal, service-worker registration
├── manifest.json           # PWA manifest (installable, standalone, themed)
├── sw.js                   # Service worker — network-first, offline fallback
├── netlify.toml            # Redirects + cache headers (revalidate, never stale)
│
├── css/
│   ├── tokens.css          # 🎨 Design tokens — the blueprint theme source of truth
│   ├── base.css            # Resets, layout primitives
│   └── components.css      # Cards, ledger rows, pills, charts, nav
│
├── js/
│   ├── config.js           # Supabase URL + public anon key (single config point)
│   ├── main.js             # Bootstrap: gate on session → load cars → start router
│   ├── core/               # router.js (epoch guard) · state.js · auth.js
│   ├── data/               # Supabase repositories (queries only)
│   ├── domain/             # 🧮 Pure, unit-tested logic (fuel, costs, schedule, format)
│   └── ui/
│       ├── pages/          # dashboard · fuel · costs · additional · settings · login
│       └── components/     # charts · modal · toast · car-header · car-schematic
│
├── supabase/
│   ├── schema.sql          # Full schema + seed (run once in the SQL editor)
│   └── migrations/         # Incremental changes
│
├── tests/                  # node:test suites (24 tests, no browser needed)
└── docs/                   # README assets
```

---

## Data model

Eight tables, all keyed to `cars`, cascade-deleted with the car they belong to.

```mermaid
erDiagram
    cars ||--o{ fuel_logs : has
    cars ||--o{ maintenance_logs : has
    cars ||--o{ maintenance_schedules : has
    cars ||--o{ supplies : has
    cars ||--o{ insurance_records : has
    cars ||--o{ registrations : has
    cars ||--o{ other_costs : has

    cars {
        text make_model
        int year
        text status "active | sold | stored"
        numeric purchase_price
        numeric factory_fuel_spec "L/100km"
    }
    fuel_logs {
        date date
        numeric odometer_km
        numeric liters
        numeric total_cost
        boolean is_full_tank "closes a measurement period"
    }
    maintenance_schedules {
        text item_name
        numeric interval_km
        int interval_months
        numeric last_done_km
    }
```

Cost data is spread across several tables (`maintenance_logs`, `supplies`, `insurance_records`, `registrations`, `other_costs`) — each with its own date column — and unified for display in [`js/domain/costs.js`](js/domain/costs.js). Note that `insurance_records` uses `start_date`, not `date`; getting this wrong used to crash sorting, which is exactly the kind of thing the `COST_TYPES` map now centralises.

---

## Getting started

**Prerequisites:** Node.js (for the dev server & tests) and a free [Supabase](https://supabase.com) project.

```bash
# 1 — clone
git clone https://github.com/abdallah362728/cars-management.git
cd cars-management

# 2 — set up the database
#     open your Supabase project's SQL editor and run:
#       supabase/schema.sql
#     (creates all tables + seed rows, and enables per-user RLS)

# 3 — create your account, then claim the seed data
#     sign up in the app (or Dashboard → Authentication → Users),
#     then run supabase/migrations/002_enable_rls.sql — it attaches
#     the existing rows to your account (see "Security" below)

# 4 — point the app at your project
#     edit js/config.js with your Supabase URL and public anon key

# 5 — run it locally
npm run dev          # serves at http://localhost:3000
```

> **On the anon key:** it's a *public* client-side key by design — row access is governed by Supabase Row-Level Security, not by hiding the key. It lives only in `js/config.js` so it can be swapped in one place.

### Testing

```bash
npm test             # node --test → 24 tests across fuel, costs, schedule
```

The suites run in plain Node with **no browser and no build** — because all the logic worth testing lives in the pure `js/domain/` layer.

### Deployment

The app deploys as static files (no build step). [`netlify.toml`](netlify.toml) is configured so that:

- the **service worker is never cached** (clients can't get stuck on an old one), and
- JS/CSS/HTML are always **revalidated** via ETag (`max-age=0, must-revalidate`) so a deploy shows up immediately instead of being served stale.

Point Netlify (or any static host) at the repository root and you're live.

---

## Tech stack

| Layer | Choice |
|---|---|
| **Frontend** | Vanilla JavaScript, native ES modules — no framework, no bundler |
| **Charts** | [Chart.js](https://www.chartjs.org/) 4.5.1 (pinned, via CDN) |
| **Styling** | Hand-written CSS with a custom-property token system |
| **Database** | Postgres + per-user row-level security (anon key reads nothing) |
| **PWA** | Web App Manifest + service worker |
| **Hosting** | Netlify (static, zero-build) |
| **Auth** | Supabase email + password; every account gets its own garage |
| **Tests** | `node:test` (built-in) |

---

## Security

The app is **multi-tenant**: every account sees only its own cars, and everything hanging off them. Sign up and you start with an empty garage.

Every table is behind row-level security, so the anon key in [`js/config.js`](js/config.js) is public by design — on its own it reads and writes nothing.

Ownership lives in exactly one place: **`cars.user_id`**. The other seven tables already reference a car, so their policies ask "do you own this row's car?" via a `security definer` helper, `owns_car(car_id)`. `cars.user_id` defaults to `auth.uid()`, so the browser never sets it — a row is stamped with whoever inserted it.

| Who | Sees |
|---|---|
| Anyone with the anon key, not signed in | Nothing — denied at the grant level |
| A signed-in account | Only its own cars, fuel, costs, service history |
| A brand-new sign-up | An empty garage |

### Setting it up on a new database

1. **Run the schema:** [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor — tables, seed rows, and the security block.
2. **Create your account:** sign up through the app, or Dashboard → Authentication → Users → *Add user*.
3. **Apply the policies:** run [`supabase/migrations/002_enable_rls.sql`](supabase/migrations/002_enable_rls.sql). It adds `cars.user_id`, enables RLS on all eight tables, creates the policies, revokes the `anon` grants, and **backfills any pre-existing cars to your account**. It is idempotent.

The backfill matters: rows created before this migration have no owner, and a null owner matches nobody — they would silently disappear from the app. If exactly one account exists, the migration assigns them to it automatically; if several do, it aborts and tells you to name the owning address rather than guessing.

> **Order matters on a live app:** run the migration *before* deploying the new front-end. The deployed app requires a session, so a browser loading it against a database with no accounts has nothing to sign in with.

### On open sign-up

Anyone who finds the URL can register and store data in your Supabase project. RLS keeps their data and yours completely separate, but they are still **your** rows against **your** free-tier quota. If you would rather it stay invite-only, turn off Authentication → Providers → Email → *Allow new users to sign up* and create accounts yourself in the dashboard — the per-user separation works exactly the same either way.

---

<div align="center">
<sub>Built with an odometer, a stack of fuel receipts, and a refusal to guess.</sub>
</div>
