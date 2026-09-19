// Entry point for managed Node hosts (GoDaddy Node.js Hosting and similar).
// Three jobs, in order:
//   1. make sure the persistent data + upload directories exist
//   2. apply pending Prisma migrations (there is no deploy shell to run them in)
//   3. start Next.js on the port the platform assigns
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, readdirSync } from "node:fs";
import next from "next";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Everything under public/assets survives a redeploy on GoDaddy Node.js Hosting,
// so both the SQLite file and uploaded photos live there.
for (const dir of ["public/assets/uploads", "public/assets/data"]) {
  try { mkdirSync(dir, { recursive: true }); } catch {}
}

function hasMigrations() {
  try {
    return readdirSync("prisma/migrations").some((d) => !d.startsWith("."));
  } catch {
    return false;
  }
}

function migrate() {
  // With committed migrations, apply them. Without any (a fresh clone that has
  // only schema.prisma), push the schema so the first boot still has tables.
  const args = hasMigrations()
    ? ["prisma", "migrate", "deploy"]
    : ["prisma", "db", "push", "--skip-generate"];
  console.log("[trekkster] npx " + args.join(" "));
  const res = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (res.status !== 0) {
    console.warn("[trekkster] schema step failed — check DATABASE_URL in your app " +
      "secrets. Starting anyway so the runtime log is reachable.");
    return;
  }
  if (process.env.SEED_ON_BOOT === "1") {
    spawnSync("node", ["prisma/seed.mjs"], { stdio: "inherit" });
  }
}

migrate();

const app = next({ dev: false });
const handle = app.getRequestHandler();

await app.prepare();
createServer((req, res) => handle(req, res)).listen(PORT, HOST, () => {
  console.log("[trekkster] listening on http://" + HOST + ":" + PORT);
});
