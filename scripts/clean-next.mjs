// Runs before `next build`: starts every build from a fresh .next folder.
//
// GoDaddy doesn't clear the app directory between deploys, so a previous
// build's .next is still there — and when Next can't delete part of it
// (files still in use, or not removable), it aborts the build ("could not
// remove .next/export"). Renaming the whole folder aside is one operation
// that works even when its contents can't be deleted; then try to delete
// the old copy, and never fail the build over it.
import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";

const remove = (dir) => {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    return true;
  } catch (err) {
    console.warn("[clean] couldn't delete " + dir + " (" + (err.code || err.message) + ") — leaving it; it's ignored");
    return false;
  }
};

// Copies set aside by earlier builds that couldn't be deleted then.
for (const name of readdirSync(".")) if (name.startsWith(".next-old-")) remove(name);

if (existsSync(".next")) {
  const aside = ".next-old-" + Date.now();
  try {
    renameSync(".next", aside);
    remove(aside);
    console.log("[clean] cleared the previous build");
  } catch (err) {
    console.warn("[clean] couldn't move .next aside (" + (err.code || err.message) + ") — trying to delete it in place");
    remove(".next");
  }
}
