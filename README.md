# Trekkster

A live travel journal: trips with multiple dated destinations, a journal page per day,
breakout pages for individual activities, photo uploads, per-trip privacy, and a home
map with a pin for every destination.

## Stack and why

**Next.js (App Router) on Node.js.** Next.js *runs on* Node, so this is not an either/or:
you get the React UI, server-rendered pages, server actions for mutations, route handlers
for uploads, and `next/image` optimization in one deployable Node process. A bare
Node/Express API only pays off if you later add a second client (native mobile) that needs
the same API.

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15, App Router, React 19 |
| Data | Prisma ORM — SQLite in dev, Postgres in prod (one-line provider swap) |
| Auth | Email + password, verification code, signed JWT session cookie (`jose`) |
| Photos | Local disk in dev via `lib/storage.js`; swap for S3/R2/UploadThing in prod |
| Maps | Leaflet + OpenStreetMap tiles, loaded client-side |
| Styling | Nocturne design tokens in `app/globals.css` |

## Run it

```bash
cp .env.example .env        # then edit SESSION_SECRET
npm install                 # also runs scripts/normalize-routes.mjs (see below)
npm run migrate             # creates dev.db from prisma/schema.prisma
npm run seed                # optional: six demo trips
npm run dev                 # http://localhost:3000
```

### One quirk to know about

This package was authored in an environment that cannot store literal square
brackets in folder names, so Next.js dynamic segments ship as `app/trips/-id-/`
and are renamed to `app/trips/[id]/` by `scripts/normalize-routes.mjs`, which runs
automatically on `npm install`. If you copied the files around by hand and get 404s
on trip pages, run `npm run routes` once. It is idempotent, and you can delete the
script after the first run.

It is idempotent and never fails the install: if `app/trips/[id]/` is already there
(because a previous run committed it), the leftover `-id-` copy is deleted instead.
Once your repository contains only the bracketed folders you can drop the script and
its `postinstall` entry entirely.

Sign up with any email. In dev there is no SMTP configured, so the six-digit
confirmation code is **printed to the server console** (and returned by the action in
development so the verify screen can show it).

Seeded account: `demo@trekkster.app` / `travelwell` (already verified).

## Deploy

### GoDaddy Node.js Hosting

The package already meets the platform requirements: `package.json` has a non-empty
`name`, `version` and `main`; `build` and `start` are both real scripts; `start` runs
`server.mjs`, which binds `process.env.PORT`; everything needed at build or start time
(including the `prisma` CLI) is in `dependencies`, not `devDependencies`; and
`node_modules` is gitignored.

1. Push this folder to a GitHub repository — do **not** commit `node_modules` or `.env`.
2. Go to GoDaddy Node.js Hosting and choose **Connect GitHub**, then authorize it.
3. Pick the repository and branch, then **Continue**.
4. Tick **I need to add secrets for my app to boot** and add:

   | Secret | Value |
   | --- | --- |
   | `SESSION_SECRET` | A long random string (`openssl rand -base64 32`) |
   | `DATABASE_URL` | `file:./public/assets/data/app.db` — or your Postgres URL |
   | `SEED_ON_BOOT` | `1` on the very first boot only, to load the six demo trips |
   | `SMTP_URL` | Optional. Blank means codes print to the runtime log |

5. **Import & Deploy**, then open the preview URL.
6. Sign up. With no `SMTP_URL` set, read the six-digit code from **Runtime Logs**.
7. Remove `SEED_ON_BOOT` after the first boot, then **Publish Now** when ready.

Leave the root path in **General settings** as `/`. The site root renders the signup
screen directly and returns 200, so health checks never have to follow a redirect.
`/api/health` is there if you would rather check a JSON endpoint.

Three platform details the app is built around:

- **Persistence.** Only `/public/assets/` survives a redeploy, so both uploaded photos
  (`public/assets/uploads`) and the SQLite file (`public/assets/data/app.db`) live there.
  Write nothing you want to keep anywhere else in the project.
- **No deploy shell.** `server.mjs` applies the database schema itself on boot, via
  `prisma migrate deploy`. If it ever hits a database that already has these tables but
  no migration history (e.g. one that predates migrations, built with `prisma db push`),
  it self-baselines — marks the earliest committed migration as already applied, then
  retries — so this needs no manual shell access. See "Changing the schema" below for
  how to add a migration.
- **Automatic backups.** `server.mjs` also takes a consistent snapshot of `app.db`
  (SQLite `VACUUM INTO`, safe even while the app is live) on every boot and once a day
  after that, keeping the 14 most recent under `public/assets/data/backups/`. An admin
  can list, trigger, and download them from `/admin/backups`.

If a deploy fails, **Runtime Logs** is the first place to look; the schema step logs the
exact command it ran.

### Changing the schema

Migrations are committed to the repo (`prisma/migrations/`), not generated on the fly.
After editing `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name describe-the-change
```

This updates your local dev database and writes a new migration folder — commit it.
`server.mjs` picks it up and applies it automatically on the next deploy.

### Any other Node host

```bash
npm ci
npm run build
PORT=8080 npm start
```

### Production checklist

- Set a long random `SESSION_SECRET`. Cookies are `httpOnly`, `sameSite=lax`, and
  `secure` once `NODE_ENV=production`.
- Move to Postgres (`DATABASE_URL` + `provider = "postgresql"`) before running more than
  one instance — SQLite does not survive concurrent writers across processes.
- Replace `lib/storage.js` with S3/R2 presigned uploads if you scale past one instance;
  the rest of the app only consumes the URL it returns.
- Set `SMTP_URL` and `MAIL_FROM` so verification/reset codes email out instead of only
  going to the runtime log — see the examples in `.env.example`.
- Automatic backups only protect against database mistakes, not losing the whole
  persistent volume — periodically download a snapshot from `/admin/backups` somewhere
  off-server too.
- Add rate limiting to `signUp` / `signIn` in `app/actions.js` before going public.

## Data model

```
User ──< Trip ──< Destination      (name, lat/lng, arrive, depart, transport)
              └─< Page ──< Photo   (kind = DAY | ACTIVITY, ACTIVITY has parentId)
```

An activity page is a `Page` whose `kind` is `ACTIVITY` and whose `parentId` points at the
day it belongs to — that is what makes "give this one hike its own page" work without a
second table. `Trip.visibility` is `PRIVATE` or `PUBLIC`; `Page.hidden` lets you withhold a
single page from an otherwise public trip.

## Routes

| Path | What |
| --- | --- |
| `/` | Signup screen with the public-trips map — answers 200, no redirect |
| `/signup`, `/verify`, `/signin` | Email signup with confirmation code |
| `/api/health` | `{ ok: true }` — point the health check here if you prefer JSON |
| `/trips` | Home: world map with all pins, plus the trip list |
| `/trips/[id]` | Trip: cover, editable destination spine, mini map, page feed |
| `/trips/[id]/pages/[pageId]` | A single activity page |
| `/u/[handle]/[tripId]` | Public read-only view of a public trip |
| `/api/upload` | Multipart photo upload |

Mutations live in `app/actions.js` as server actions, not REST endpoints; add
`app/api/**/route.js` handlers later if a mobile client needs JSON.
