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
| Data | Prisma ORM on MySQL — GoDaddy's managed database in prod, a local MySQL in dev |
| Auth | Email + password, verification code, signed JWT session cookie (`jose`) |
| Photos | Local disk in dev via `lib/storage.js`; swap for S3/R2/UploadThing in prod |
| Maps | Leaflet + OpenStreetMap tiles, loaded client-side |
| Styling | Nocturne design tokens in `app/globals.css` |

## Run it

Needs a MySQL 8 server. On a Mac: `brew install mysql && brew services start mysql`,
then create a database and user and put them in `DATABASE_URL`. If Homebrew installs
a newer MySQL with `innodb_native_foreign_keys` off, set it `ON` in
`/opt/homebrew/etc/my.cnf` — cascading deletes misbehave without it.

```bash
cp .env.example .env        # then edit SESSION_SECRET and DATABASE_URL
npm install                 # also runs scripts/normalize-routes.mjs (see below)
npx prisma migrate deploy   # creates the tables
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
   | `DATABASE_URL` | Not needed — the managed MySQL's `DB_*` variables are used. Delete any old `file:` value |
   | `SEED_ON_BOOT` | `1` on the very first boot only, to load the six demo trips |
   | `SMTP_URL` | Optional. Blank means codes print to the runtime log |
   | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | The photo bucket — required in production, or photos are lost on the next deploy. Cloudflare R2: endpoint `https://<account-id>.r2.cloudflarestorage.com`, region `auto` |
   | `S3_PUBLIC_URL` | Optional. The bucket's public address, to serve photos straight from it |
   | `RESTORE_BACKUP` | Optional. A snapshot file name from `/admin/backups` to load into an empty database |

5. **Import & Deploy**, then open the preview URL.
6. Sign up. With no `SMTP_URL` set, read the six-digit code from **Runtime Logs**.
7. Remove `SEED_ON_BOOT` after the first boot, then **Publish Now** when ready.

Leave the root path in **General settings** as `/`. The site root renders the signup
screen directly and returns 200, so health checks never have to follow a redirect.
`/api/health` is there if you would rather check a JSON endpoint.

Three platform details the app is built around:

- **Database.** Users, trips and pages live in the managed MySQL database GoDaddy
  provides with every published app (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
  `DB_PASSWORD`). It isn't part of the deploy, so redeploying never touches the data.
  The boot log prints which host/database it connected to, and the MySQL version.
- **Photos.** Uploaded photos go to an S3-compatible bucket (Cloudflare R2), set up with
  the `S3_*` secrets in `.env.example` — the app's own disk was being wiped by deploys,
  taking photos with it. Without those settings (local development) they're written to
  `public/assets/uploads`. Either way they're linked as `/api/photo?f=<name>`; the boot
  log says which is in use, and copies any photo still on local disk up to the bucket.
- **Videos.** Short clips (up to 60 seconds and 100 MB — `lib/media.js`) are too big to
  pass through the app, so the browser uploads them straight to the bucket using a
  15-minute pre-signed URL, then the app checks what arrived. That needs a CORS rule on
  the bucket. In Cloudflare: R2 → the bucket → Settings → CORS Policy → Edit, and paste:

  ```json
  [
    {
      "AllowedOrigins": ["https://trekkster.app", "https://www.trekkster.app"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```

  Add any other address the site is opened on (such as a preview URL) to
  `AllowedOrigins`. Without the rule, photo uploads still work but video uploads fail.
- **Backups on disk.** Backup snapshots are written to `public/assets/data/backups`. Because that's under `public/`, `server.mjs` (and `middleware.js`) refuse
  every request for `/assets/data/*`, so backups are never served as static files.
- **No deploy shell.** `server.mjs` applies the database schema itself on boot, via
  `prisma migrate deploy`. See "Changing the schema" below for how to add a migration.
- **Automatic backups.** `server.mjs` also writes a JSON snapshot of every table on every
  boot and once a day after that, keeping the 14 most recent under
  `public/assets/data/backups/`. An admin can list, trigger, and download them from
  `/admin/backups`. `RESTORE_BACKUP` loads one into an empty database (e.g. a fresh one).

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
