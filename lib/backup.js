import { mkdir, readdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { db } from "./db.js";

// Snapshots live next to the live database, under the same persistent
// directory (public/assets/data), so they survive redeploys the same way the
// database itself does. SQLite's VACUUM INTO produces a fully consistent copy
// even while the app is actively reading/writing — a plain file copy would
// risk grabbing a half-written page.
const DIR = "public/assets/data/backups";
const KEEP = 14; // most recent snapshots to retain

function stamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function snapshotDatabase() {
  await mkdir(DIR, { recursive: true });
  const file = join(DIR, "app-" + stamp(new Date()) + ".db");
  const escaped = file.replace(/'/g, "''");
  await db.$executeRawUnsafe("VACUUM INTO '" + escaped + "'");
  await pruneOldBackups();
  return file;
}

async function pruneOldBackups() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".db")).sort();
  while (files.length > KEEP) {
    const oldest = files.shift();
    await unlink(join(DIR, oldest)).catch(() => {});
  }
}

export async function listBackups() {
  await mkdir(DIR, { recursive: true });
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".db"));
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
