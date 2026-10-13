// Entry point for managed Node hosts (GoDaddy Node.js Hosting and similar).
// Jobs, in order:
//   1. make sure the persistent data + upload directories exist, and point
//      DATABASE_URL at the database file inside them
//   2. optionally restore a backup (RESTORE_BACKUP) — there is no shell to do it in
//   3. apply pending Prisma migrations (no deploy shell to run them in either)
//   4. snapshot the database (on boot, then daily) — see lib/backup.js
//   5. start Next.js on the port the platform assigns
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import nextEnv from "@next/env";

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
const DATA_DIR = "public/assets/data";

// Everything under public/assets survives a redeploy on GoDaddy Node.js Hosting,
// so both the SQLite file and uploaded photos live there.
for (const dir of ["public/assets/uploads", DATA_DIR]) {
  try { mkdirSync(dir, { recursive: true }); } catch {}
}

// Prisma resolves a relative SQLite path against prisma/ (where schema.prisma
// lives), not the project root. The value this app used to document,
// file:./public/assets/data/app.db, therefore put the database in
// prisma/public/assets/data/ — outside the persistent directory, so every
// redeploy wiped it. Anything written as ./public/… was clearly meant from
// the project root, so pin it there as an absolute path; the Prisma CLI runs
// below and Next.js both inherit it from process.env.
function sqlitePath() {
  const url = process.env.DATABASE_URL || "";
  if (!url.startsWith("file:")) return null; // Postgres etc. — nothing to do
  const [rawPath, query] = url.slice("file:".length).split("?");
  if (isAbsolute(rawPath)) return rawPath;
  if (/^(\.\/)?public\//.test(rawPath)) {
    const abs = resolve(rawPath);
    process.env.DATABASE_URL = "file:" + abs + (query ? "?" + query : "");
    console.log("[trekkster] DATABASE_URL is relative to the project root; using " + abs);
    console.log("[trekkster] (set DATABASE_URL to file:../public/assets/data/app.db to silence this)");
    return abs;
  }
  return resolve("prisma", rawPath);
}

const dbFile = sqlitePath();

// A database left at the old, non-persistent location on a host where it
// happened to survive (a VPS, a local checkout) — carry it over once.
if (dbFile && !existsSync(dbFile)) {
  const legacy = resolve("prisma", DATA_DIR, "app.db");
  if (legacy !== dbFile && existsSync(legacy)) {
    copyFileSync(legacy, dbFile);
    console.log("[trekkster] copied database from old location " + legacy + " → " + dbFile);
  }
}

// RESTORE_BACKUP=app-2026-….db replaces the live database with that snapshot
// from public/assets/data/backups on the next boot — the only way to restore
// on a host with no shell. A marker file makes it happen once per snapshot, so
// leaving the secret set by mistake can't keep rolling the data back.
const restoreName = basename(process.env.RESTORE_BACKUP || "");
if (dbFile && restoreName) {
  const source = join(DATA_DIR, "backups", restoreName);
  const marker = join(DATA_DIR, ".restored-" + restoreName);
  if (existsSync(marker)) {
    console.log("[trekkster] RESTORE_BACKUP " + restoreName + " was already restored — remove the secret");
  } else if (!existsSync(source)) {
    console.warn("[trekkster] RESTORE_BACKUP: no backup named " + restoreName + " in " + join(DATA_DIR, "backups"));
  } else {
    if (existsSync(dbFile)) {
      const keep = join(DATA_DIR, "backups", "pre-restore-" + new Date().toISOString().replace(/[:.]/g, "-") + ".db.bak");
      copyFileSync(dbFile, keep);
      console.log("[trekkster] saved the current database as " + keep + " before restoring");
    }
    copyFileSync(source, dbFile);
    writeFileSync(marker, new Date().toISOString() + "\n");
    console.log("[trekkster] restored database from " + source);
  }
}

// lib/backup.js creates its PrismaClient on import, so load it only now that
// DATABASE_URL is final.
const { snapshotDatabase } = await import("./lib/backup.js");

function migrationNames() {
  try {
    return readdirSync("prisma/migrations").filter((d) => !d.startsWith(".")).sort();
  } catch {
    return [];
  }
}

// Runs an `npx prisma ...` command, printing its output live (same visibility
// as stdio:"inherit") while also capturing it so migrate() can inspect it.
function run(args) {
  const res = spawnSync("npx", args, { encoding: "utf8", shell: process.platform === "win32" });
  const output = (res.stdout || "") + (res.stderr || "");
  if (output) process.stdout.write(output);
  return { status: res.status, output };
}

function finishSchemaStep(ok) {
  if (!ok) {
    console.warn("[trekkster] schema step failed — check DATABASE_URL in your app " +
      "secrets. Starting anyway so the runtime log is reachable.");
    return;
  }
  if (process.env.SEED_ON_BOOT === "1") {
    spawnSync("node", ["prisma/seed.mjs"], { stdio: "inherit" });
  }
}

function migrate() {
  const names = migrationNames();

  // No committed migrations yet (a fresh clone that only has schema.prisma) —
  // push the schema so the first boot still has tables.
  if (names.length === 0) {
    console.log("[trekkster] npx prisma db push --skip-generate");
    const res = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"],
      { stdio: "inherit", shell: process.platform === "win32" });
    finishSchemaStep(res.status === 0);
    return;
  }

  console.log("[trekkster] npx prisma migrate deploy");
  let res = run(["prisma", "migrate", "deploy"]);

  if (res.status !== 0 && res.output.includes("P3005")) {
    // The tables already exist (this database was built with `prisma db push`
    // before migrations were introduced) but there's no migration history yet.
    // Baseline it: mark the earliest migration as already applied — its SQL
    // matches what's already there — then retry. Self-healing, so this needs
    // no manual shell access on a host with none.
    console.log("[trekkster] baselining existing database against " + names[0]);
    run(["prisma", "migrate", "resolve", "--applied", names[0]]);
    res = run(["prisma", "migrate", "deploy"]);
  }

  finishSchemaStep(res.status === 0);
}

migrate();

async function backupTick() {
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

// The database and its backups live under public/ (the only persistent
// directory), and Next serves whatever is in public/ as static files. Never
// let a request reach them; admins download backups through /admin/backups.
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
