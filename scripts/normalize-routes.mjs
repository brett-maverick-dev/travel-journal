// Restores Next.js dynamic-route folder names.
// This package was authored in an environment that cannot store literal
// square brackets in path names, so dynamic segments ship as -id- and are
// renamed to [id] here. Runs on postinstall; safe to run twice.
import { readdir, rename } from "node:fs/promises";
import { join } from "node:path";

const PATTERN = /^-{1,3}([A-Za-z0-9_]+)-$/;

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return 0; }
  let renamed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let name = entry.name;
    const match = PATTERN.exec(name);
    if (match) {
      const next = "[" + match[1] + "]";
      await rename(join(dir, name), join(dir, next));
      console.log("[routes] " + join(dir, name) + " -> " + next);
      name = next;
      renamed++;
    }
    renamed += await walk(join(dir, name));
  }
  return renamed;
}

const n = await walk("app");
if (n) console.log("[routes] normalized " + n + " dynamic segment(s)");
