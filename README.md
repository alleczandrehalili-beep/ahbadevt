# FieldFlow Operations

A responsive field-service operations system for a Sky Cable managed service provider. It has two front-ends that share one cloud database, so the office and the field stay in sync:

- **Office dashboard** (`index.html`) — central operations view: dispatch board, team monitoring for 20 technician teams, work-order intake, and daily expense tracking.
- **Technician mobile app** (`mobile.html`) — an installable phone app. A technician signs in by selecting their team, sees the jobs dispatched to them, and advances each job's status from the field.

## How sync works

Both apps read and write the same Supabase `jobs` table through `ahba-cloud.js` (dashboard) and the inline cloud helper (mobile). They use **identical column names and team names**, so a job dispatched on the dashboard to e.g. "Sky Link" appears on the Sky Link phone, and a status change on the phone flows straight back to the dashboard.

Status flow: `pending → assigned → en-route → on-site → in-progress → completed`.

Updates propagate instantly when Supabase Realtime is enabled, and every 15 seconds via polling as a fallback. A sync-status badge (Synced / Saving / Sync error) is shown in both apps so problems are never silent.

## One-time Supabase setup

Run `supabase-setup.sql` once in the Supabase SQL Editor. It creates the `jobs` table with the exact schema the apps expect, sets Row Level Security policies for the anon (publishable) key, and enables Realtime on the table.

> The included anon key is a public *publishable* key (safe for client-side use). The RLS policies in the setup are permissive for the prototype — tighten them before production.

## Run locally

Open `index.html` (dashboard) or `mobile.html` (technician app) directly, or serve the folder:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000` (dashboard) or `http://localhost:8000/mobile.html` (mobile). On a phone, use **Add to Home Screen** to install the mobile app.

## Files

| File | Purpose |
| --- | --- |
| `index.html` / `app.js` / `styles.css` | Office dashboard |
| `mobile.html` | Technician mobile app (self-contained) |
| `manifest.webmanifest` | PWA manifest for the mobile app |
| `ahba-cloud.js` | Supabase sync layer for the dashboard |
| `supabase-setup.sql` | One-time database setup |

This is a front-end prototype. Production deployment will still require real authentication, mobile GPS permissions, file storage for receipts/photos, and mapping/SMS services.
