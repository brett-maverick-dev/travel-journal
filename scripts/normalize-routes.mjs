// Restores Next.js dynamic-route folder names.
// This package was authored in an environment that cannot store literal square
// brackets in path names, so dynamic segments ship as -id- and are renamed to
// [id] here. Runs on postinstall. Idempotent, and never fails the install:
// if the real [id] folder is already present, the -id- copy is discarded.
import { readdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PATTERN = /^-{1,3}([A-Za-z0-9_]+)-$/;

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return 0; }
  let changed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let name = entry.name;
    const match = PATTERN.exec(name);
    if (match) {
      const target = "[" + match[1] + "]";
      const from = join(dir, name);
      const to = join(dir, target);
      if (existsSync(to)) {
        // Already normalized in a previous run or committed that way.
        await rm(from, { recursive: true, force: true });
        console.log("[routes] " + target + " already present, removed stale " + from);
      } else {
        await rename(from, to);
        console.log("[routes] " + from + " -> " + target);
      }
      name = target;
      changed++;
    }
    changed += await walk(join(dir, name));
  }
  return changed;
}

try {
  const n = await walk("app");
  console.log(n ? "[routes] normalized " + n + " segment(s)" : "[routes] nothing to do");
} catch (err) {
  // A route-naming problem must never block the install or the boot.
  console.warn("[routes] skipped: " + err.message);
}
