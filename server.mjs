// Entry point for managed Node hosts (GoDaddy Node.js Hosting and similar).
// Jobs, in order:
//   1. point DATABASE_URL at the platform's managed MySQL database
//   2. apply pending Prisma migrations (there is no deploy shell to run them in)
//   3. optionally seed (SEED_ON_BOOT) or restore a backup (RESTORE_BACKUP)
//   4. snapshot the database (on boot, then daily) — see lib/backup.js
//   5. start Next.js on the port the platform assigns
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

// Every path below (public/assets, prisma/, .next) is relative to the app,
// so don't depend on the host launching us from the app directory.
process.chdir(dirname(fileURLToPath(import.meta.url)));

// This always runs the production build (dev: false below), so React and the
// session cookie's `secure` flag need NODE_ENV to say so. Hosts that launch
// `node server.mjs` directly often don't set it, and without it React loads its
// development build next to Next's production bundle ("dispatcher.getOwner is
// not a function"). Set before Next.js is loaded, hence the dynamic import.
process.env.NODE_ENV ||= "production";
const { default: next } = await import("next");

// Next would load .env itself, but only once app.prepare() runs — the schema
// and backup steps below need DATABASE_URL before that.
nextEnv.loadEnvConfig(process.cwd());

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Uploaded photos and backup snapshots live under public/assets, the
// directory GoDaddy keeps between deploys. The database itself is MySQL.
for (const dir of ["public/assets/uploads", "public/assets/data"]) {
  try { mkdirSync(dir, { recursive: true }); } catch {}
}

// GoDaddy hands each published app a managed MySQL database as DB_HOST,
// DB_PORT, DB_NAME, DB_USER and DB_PASSWORD. A DATABASE_URL secret that is
// already a mysql:// URL wins; anything else (such as the file: URL from the
// SQLite days) is replaced with one built from the DB_* variables. Prisma CLI
// runs below and Next.js both inherit it from process.env.
function resolveDatabaseUrl() {
  const current = process.env.DATABASE_URL || "";
  if (/^mysql:\/\//.test(current)) {
    const { hostname, port, pathname } = new URL(current);
    console.log("[trekkster] database: DATABASE_URL → " + hostname + ":" + (port || 3306) + pathname);
    return true;
  }
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  if (DB_HOST && DB_NAME && DB_USER) {
    process.env.DATABASE_URL = "mysql://" + encodeURIComponent(DB_USER) +
      (DB_PASSWORD ? ":" + encodeURIComponent(DB_PASSWORD) : "") +
      "@" + DB_HOST + ":" + (DB_PORT || 3306) + "/" + encodeURIComponent(DB_NAME);
    console.log("[trekkster] database: DB_* variables → " + DB_HOST + ":" + (DB_PORT || 3306) + "/" + DB_NAME +
      (current ? " (ignoring the non-MySQL DATABASE_URL secret)" : ""));
    return true;
  }
  // Names only — never print values.
  const seen = Object.keys(process.env).filter((k) => /^(DB_|DATABASE|MYSQL)/i.test(k));
  console.error("[trekkster] no MySQL database configured — need DB_HOST, DB_NAME and DB_USER " +
    "(and usually DB_PASSWORD), or a mysql:// DATABASE_URL. Found: " + (seen.join(", ") || "none"));
  return false;
}

// Runs an `npx prisma ...` command, printing its output live while also
// capturing it so the caller can inspect it.
function run(args) {
  const res = spawnSync("npx", args, { encoding: "utf8", shell: process.platform === "win32" });
  const output = (res.stdout || "") + (res.stderr || "");
  if (output) process.stdout.write(output);
  return { status: res.status, output };
}

// The SQLite-era migrations, replaced by 20261013030000_init_mysql. GoDaddy
// doesn't clear the app directory between deploys, so these can still be on
// disk after they were deleted from git — and Prisma would run them against
// MySQL. Remove them before migrating.
const RETIRED_MIGRATIONS = [
  "20260918183603_init", "20260921010236_add_buddies", "20260921011748_add_trip_buddies",
  "20261013005834_add_code_attempts", "20261013023048_add_trip_departure"
];

function migrate() {
  for (const name of RETIRED_MIGRATIONS) {
    const dir = "prisma/migrations/" + name;
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log("[trekkster] removed leftover SQLite migration " + name);
    }
  }

  console.log("[trekkster] npx prisma migrate deploy");
  let res = run(["prisma", "migrate", "deploy"]);

  // P3009: the database records a failed migration, and Prisma won't apply
  // anything until it's resolved. If every failed one is a migration this
  // app no longer ships — GoDaddy extracts each deploy over the previous
  // files without cleaning, so migrations deleted from git (the old SQLite
  // ones) can linger on disk for a deploy and get run against MySQL — mark
  // it rolled back and retry. A failure in a migration we do ship is real and
  // is left for a person to look at.
  if (res.status !== 0 && res.output.includes("P3009")) {
    const failed = [...res.output.matchAll(/The `([^`]+)` migration started at [^\n]* failed/g)].map((m) => m[1]);
    let shipped = [];
    try { shipped = readdirSync("prisma/migrations"); } catch {}
    const stale = failed.filter((name) => !shipped.includes(name));
    if (failed.length && stale.length === failed.length) {
      for (const name of stale) {
        console.log("[trekkster] " + name + " isn't one of this app's migrations — marking its failed run rolled back");
        run(["prisma", "migrate", "resolve", "--rolled-back", name]);
      }
      res = run(["prisma", "migrate", "deploy"]);
    } else if (failed.length) {
      console.warn("[trekkster] migration " + failed.filter((n) => !stale.includes(n)).join(", ") +
        " failed part-way. Fix the cause, then mark it with `prisma migrate resolve`.");
    }
  }

  if (res.status === 0) return true;
  if (/already exists/i.test(res.output)) {
    console.warn("[trekkster] tables left over from an earlier, failed setup are in the way. Drop them " +
      "from GoDaddy's Database section (SQL editor) — they hold no app data if the app never started " +
      "cleanly — and redeploy.");
  } else if (res.output.includes("P3005")) {
    console.warn("[trekkster] the MySQL database already has tables that didn't come from these " +
      "migrations. Empty it from GoDaddy's Database section (SQL editor) and redeploy.");
  } else {
    console.warn("[trekkster] schema step failed — check the database variables. " +
      "Starting anyway so the runtime log is reachable.");
  }
  return false;
}

const dbReady = resolveDatabaseUrl() && migrate();

// lib/backup.js creates its PrismaClient on import, so load it only now that
// DATABASE_URL is final.
const { snapshotDatabase, restoreBackup } = await import("./lib/backup.js");
const { db } = await import("./lib/db.js");

if (dbReady) {
  // Worth having in the runtime log: cascading deletes (deleting a user or a
  // trip) rely on the server's foreign keys behaving like MySQL 8's.
  try {
    const [row] = await db.$queryRawUnsafe("SELECT VERSION() AS version");
    let fkMode = "";
    try {
      const [fk] = await db.$queryRawUnsafe("SELECT @@innodb_native_foreign_keys AS native");
      fkMode = Number(fk.native) ? " (native foreign keys)" : " (innodb_native_foreign_keys=OFF)";
    } catch {} // MySQL 8 has no such variable — native foreign keys, nothing to report
    console.log("[trekkster] MySQL " + row.version + fkMode);
  } catch (err) {
    console.warn("[trekkster] couldn't query the database: " + err.message);
  }

  // RESTORE_BACKUP=app-2026-….json loads that snapshot from
  // public/assets/data/backups — only into an empty database, so leaving the
  // secret set can't overwrite anything later.
  if (process.env.RESTORE_BACKUP) {
    try {
      const counts = await restoreBackup(process.env.RESTORE_BACKUP);
      console.log("[trekkster] restored " + process.env.RESTORE_BACKUP + ": " + JSON.stringify(counts) +
        " — remove the RESTORE_BACKUP secret");
    } catch (err) {
      console.warn("[trekkster] RESTORE_BACKUP skipped: " + err.message);
    }
  }

  if (process.env.SEED_ON_BOOT === "1") {
    spawnSync("node", ["prisma/seed.mjs"], { stdio: "inherit" });
  }
}

async function backupTick() {
  if (!dbReady) return;
  try {
    const file = await snapshotDatabase();
    console.log("[trekkster] database snapshot → " + file);
  } catch (err) {
    console.warn("[trekkster] database snapshot failed: " + err.message);
  }
}

// Photos: in the S3-compatible bucket when configured (deploys can wipe the
// app's own disk), else local disk. Any photo still on disk is copied up on
// boot — in the background, so a slow bucket can't hold up the start.
const store = await import("./lib/object-store.js");
const UPLOADS = process.env.UPLOAD_DIR || "public/assets/uploads";
if (store.storeConfigured()) {
  console.log("[trekkster] photos: bucket " + process.env.S3_BUCKET + " at " + new URL(process.env.S3_ENDPOINT).host +
    (process.env.S3_PUBLIC_URL ? " (served from " + process.env.S3_PUBLIC_URL + ")" : ""));
  (async () => {
    let copied = 0;
    for (const name of readdirSync(UPLOADS).filter((f) => !f.startsWith("."))) {
      if (await store.objectExists(name)) continue;
      const type = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", heic: "image/heic" }[name.split(".").pop().toLowerCase()];
      await store.putObject(name, readFileSync(UPLOADS + "/" + name), type);
      copied++;
    }
    if (copied) console.log("[trekkster] photos: copied " + copied + " from local disk to the bucket");
  })().catch((err) => console.warn("[trekkster] photos: copying local files to the bucket failed: " + err.message));
} else {
  console.warn("[trekkster] photos: no S3_* settings — storing them on local disk" +
    (process.env.NODE_ENV === "production" ? ", which deploys can wipe. Set up the photo bucket (see README)." : ""));
}

// One on boot (a free pre-deploy safety net), then daily while the process
// keeps running. setInterval is enough here — this is a single long-running
// process, not something that needs an external scheduler.
await backupTick();
setInterval(backupTick, 24 * 60 * 60 * 1000);

const app = next({ dev: false });
const handle = app.getRequestHandler();

// Backup snapshots live under public/ (the only persistent directory), and
// Next serves whatever is in public/ as static files. Never let a request
// reach them; admins download backups through /admin/backups.
function isPrivateData(url) {
  let path = (url || "/").split("?")[0];
  try { path = decodeURIComponent(path); } catch {}
  return path.replace(/\/{2,}/g, "/").toLowerCase().startsWith("/assets/data");
}

await app.prepare();
createServer((req, res) => {
  if (isPrivateData(req.url)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  handle(req, res);
}).listen(PORT, HOST, () => {
  console.log("[trekkster] listening on http://" + HOST + ":" + PORT);
});
