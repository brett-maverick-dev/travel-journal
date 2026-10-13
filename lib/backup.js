import { mkdir, readdir, readFile, unlink, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "./db.js";

// JSON snapshots of every table, kept under public/assets/data/backups (the
// directory GoDaddy keeps between deploys, and one server.mjs never serves).
// The live data is in MySQL; these are a download-able, restorable copy.
const DIR = "public/assets/data/backups";
const KEEP = 14; // most recent snapshots to retain

// Parents before children, so a restore can insert in this order.
const TABLES = ["user", "buddy", "trip", "tripBuddy", "destination", "page", "photo"];

function stamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function snapshotDatabase() {
  await mkdir(DIR, { recursive: true });
  const tables = {};
  for (const t of TABLES) tables[t] = await db[t].findMany();
  const file = join(DIR, "app-" + stamp(new Date()) + ".json");
  await writeFile(file, JSON.stringify({ version: 1, takenAt: new Date().toISOString(), tables }));
  await pruneOldBackups();
  return file;
}

async function pruneOldBackups() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".json")).sort();
  while (files.length > KEEP) {
    const oldest = files.shift();
    await unlink(join(DIR, oldest)).catch(() => {});
  }
}

export async function listBackups() {
  await mkdir(DIR, { recursive: true });
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".json"));
  const withStats = await Promise.all(files.map(async (name) => {
    const s = await stat(join(DIR, name));
    return { name, size: s.size, mtime: s.mtime };
  }));
  return withStats.sort((a, b) => b.mtime - a.mtime);
}

export async function backupPath(name) {
  // Only ever serve a name that's actually in the backups directory listing —
  // never trust a filename handed in from outside (e.g. a query param).
  const files = await listBackups();
  const hit = files.find((f) => f.name === name);
  return hit ? join(DIR, hit.name) : null;
}

// Loads a snapshot into an EMPTY database (no users yet) — e.g. a fresh
// managed database after moving hosts. Refuses otherwise, so it can never
// overwrite live data.
export async function restoreBackup(name) {
  const path = await backupPath(name);
  if (!path) throw new Error("no backup named " + name);
  if (await db.user.count()) throw new Error("the database already has users — restore only runs into an empty one");
  const { tables } = JSON.parse(await readFile(path, "utf8"));
  const counts = {};
  await db.$transaction(async (tx) => {
    for (const t of TABLES) {
      const rows = tables?.[t] || [];
      if (rows.length) await tx[t].createMany({ data: rows });
      counts[t] = rows.length;
    }
  }, { timeout: 120000 });
  return counts;
}
