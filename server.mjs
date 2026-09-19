// Entry point for managed Node hosts (GoDaddy Node.js Hosting and similar).
// Four jobs, in order:
//   1. make sure the persistent data + upload directories exist
//   2. apply pending Prisma migrations (there is no deploy shell to run them in)
//   3. snapshot the database (on boot, then daily) — see lib/backup.js
//   4. start Next.js on the port the platform assigns
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import next from "next";
import { snapshotDatabase } from "./lib/backup.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Everything under public/assets survives a redeploy on GoDaddy Node.js Hosting,
// so both the SQLite file and uploaded photos live there.
for (const dir of ["public/assets/uploads", "public/assets/data"]) {
  try { mkdirSync(dir, { recursive: true }); } catch {}
}

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

await app.prepare();
createServer((req, res) => handle(req, res)).listen(PORT, HOST, () => {
  console.log("[trekkster] listening on http://" + HOST + ":" + PORT);
});
