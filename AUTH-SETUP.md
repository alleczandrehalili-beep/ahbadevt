# Technician accounts — setup guide (AHBA_SLI001–AHBA_SLI020)

This adds secure logins for the 20 field teams. Passwords are handled by **Supabase Auth** — they are encrypted and never visible to anyone (including the admin), but the admin can **reset** them. Each technician can also change their own password.

Do these steps once, in order.

## A. Turn on email login in Supabase

1. Supabase → **Authentication → Providers → Email**: make sure **Email** is **enabled**.
2. In the same Email settings, turn **OFF "Confirm email"** (these are internal accounts with an internal domain, so there's no inbox to confirm from).

## B. Create the 20 login accounts

The login email format is `ahba_sli001@ahbafield.app` … `ahba_sli020@ahbafield.app`, all with the starting password **`Ahba@2026`**.

**Reliable way (recommended):** Supabase → **Authentication → Users → Add user**, and add each one:
- Email: `ahba_sli001@ahbafield.app` (then 002, 003 … up to 020)
- Password: `Ahba@2026`
- Tick **Auto Confirm User**

**Fast way (optional):** open `supabase-auth-setup.sql`, uncomment the `do $$ … $$;` block at the bottom, and run it once. If it errors on your Supabase version, just use the manual way above.

## C. Run the database setup

Supabase → **SQL Editor → New query** → paste all of `supabase-auth-setup.sql` → **Run**. This:
- renames existing jobs from the old team names to AHBA_SLI001–020,
- creates the `technicians` table the dashboard reads for the Accounts page.

## D. Upload the updated files to GitHub

Upload/replace these in the repo (Add file → Upload files → Commit):
`index.html`, `app.js`, `mobile.html`, `supabase-auth-setup.sql`, `AUTH-SETUP.md`.
*(styles.css, ahba-cloud.js, manifest.webmanifest, icons are unchanged.)*

GitHub Pages republishes in ~1 minute.

## E. Test

1. Open the mobile app: `https://alleczandrehalili-beep.github.io/ahbadevt/mobile.html`
2. Sign in with **AHBA_SLI004 / Ahba@2026** → it will ask you to set a new password (first login).
3. After setting it, you'll see the jobs dispatched to AHBA_SLI004 (e.g. Maria Santos).
4. On the dashboard, open the new **Accounts** tab to see all 20 accounts, who has signed in, and who still needs to set a password. Use **Reset** for the Supabase reset steps.

## How password reset works

- **Technician forgot password →** Admin opens Supabase → Authentication → Users → finds their email → Reset password (or sets a temporary one) → tells the technician. Optionally set `must_change = true` in the `technicians` table so they're forced to choose a new one on next login.
- The dashboard's **Reset** button shows these exact steps and links straight to the Supabase Users page.

## Note on this prototype

The app is client-side and uses Supabase's public *publishable* key. Login passwords are safe (Supabase Auth hashes them). For full production hardening you'd also add Row Level Security tied to each logged-in user and move dispatcher access behind a login too.
