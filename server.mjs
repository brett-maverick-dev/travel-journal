// Entry point for managed Node hosts (GoDaddy Node.js Hosting and similar).
// Jobs, in order:
//   1. point DATABASE_URL at the platform's managed MySQL database
//   2. apply pending Prisma migrations (there is no deploy shell to run them in)
//   3. optionally seed (SEED_ON_BOOT) or restore a backup (RESTORE_BACKUP)
//   4. snapshot the database (on boot, then daily) — see lib/backup.js
//   5. start Next.js on the port the platform assigns
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
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

function migrate() {
  console.log("[trekkster] npx prisma migrate deploy");
  const res = run(["prisma", "migrate", "deploy"]);
  if (res.status === 0) return true;
  if (res.output.includes("P3005")) {
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
