// Shared facts about the repository and what git would publish.

import { execFileSync } from 'node:child_process';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * The path GitHub Pages serves a project site from, taken from the remote so it
 * matches the deployed URL rather than whatever the folder happens to be called.
 */
export function repoName() {
  try {
    const url = git(['remote', 'get-url', 'origin']).trim();
    const match = url.match(/([^/:]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    /* no remote configured; fall back to the directory name */
  }
  return basename(ROOT);
}

/** Paths git has under version control, and so the paths that will deploy. */
export function trackedFiles() {
  return new Set(git(['ls-files', '-z']).split('\0').filter(Boolean));
}

/** Working tree entries that differ from the index or are unknown to git. */
export function pendingChanges() {
  const out = [];
  const raw = git(['status', '--porcelain', '-z']).split('\0').filter(Boolean);
  for (const entry of raw) {
    out.push({ state: entry.slice(0, 2).trim(), path: entry.slice(3) });
  }
  return out;
}

/** A repo-relative, forward-slashed path, the form git speaks in. */
export function gitPath(absolute) {
  return relative(ROOT, absolute).split(sep).join('/');
}
