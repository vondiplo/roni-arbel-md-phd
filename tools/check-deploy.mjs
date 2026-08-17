// Checks the things that break on GitHub Pages but never locally.
//
//   1. A file present on your disk is not a file that deploys. Only what git
//      tracks gets published, so every referenced asset has to be committed.
//   2. macOS filesystems ignore case; the servers behind Pages do not.
//   3. A project site is served from /<repo-name>/, so an absolute path such as
//      /oval/styles.css resolves at the domain root and 404s.
//   4. The player builds audio filenames at runtime, so a renamed character or a
//      missing speed variant only shows up when someone presses play.
//
// Run:  node tools/check-deploy.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gitPath, pendingChanges, repoName, ROOT, trackedFiles } from './repo.mjs';

const SITE_EXTENSIONS = new Set(['.html', '.css', '.js']);
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'tools', '.github', 'audio']);
// A scheme, a protocol-relative host, a fragment or a bare query is not a file.
const NOT_A_PATH = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i;

// Keyed so a file imported from several modules is only reported once.
const problems = new Map();
const report = (kind, message, detail) => {
  problems.set(`${kind}\u0000${detail}`, { kind, message, detail });
};

/* ---------- collect the files that make up the published site ---------- */

function siteSources(directory = ROOT, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      siteSources(join(directory, entry.name), found);
    } else if (SITE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

/* ---------- collect every path those files point at ---------- */

const PATTERNS = {
  markup: [/(?:href|src)\s*=\s*["']([^"']+)["']/gi],
  style: [/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi],
  script: [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ],
};

function referencesIn(file) {
  const text = readFileSync(file, 'utf8');
  const extension = extname(file).toLowerCase();
  const patterns = [
    ...(extension === '.html' ? [...PATTERNS.markup, ...PATTERNS.style] : []),
    ...(extension === '.css' ? PATTERNS.style : []),
    ...(extension === '.js' ? PATTERNS.script : []),
  ];

  const found = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) found.add(match[1]);
  }
  return found;
}

/** Filenames the player asks for at runtime, using the app's own mapping. */
async function audioReferences() {
  const letters = await import(pathToFileURL(join(ROOT, 'oval/js/letters.js')).href);
  const found = new Set();
  for (const name of letters.letterNames()) {
    for (let speed = 0; speed < letters.SPEED_COUNT; speed += 1) {
      found.add(letters.soundFile(name, speed));
    }
  }
  return found;
}

/* ---------- validate one reference ---------- */

const tracked = trackedFiles();

/** True when every segment of the path matches the filesystem's own spelling. */
function spelledExactly(absolute) {
  let walked = ROOT;
  for (const segment of relative(ROOT, absolute).split(sep)) {
    let entries;
    try {
      entries = readdirSync(walked);
    } catch {
      return false;
    }
    if (!entries.includes(segment)) return false;
    walked = join(walked, segment);
  }
  return true;
}

/**
 * @param from   file the reference is resolved against
 * @param origin file to blame in the report, when it differs from `from`
 */
function checkReference(from, reference, origin = from) {
  const where = `${gitPath(origin)} \u2192 ${reference}`;
  const path = reference.split(/[?#]/)[0];
  if (!path || NOT_A_PATH.test(path)) return;

  if (path.startsWith('/')) {
    report('absolute', 'absolute paths break under the /<repo>/ subpath', where);
    return;
  }

  let target = resolve(dirname(from), path);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    report('outside', 'points outside the repository', where);
    return;
  }

  let info;
  try {
    info = statSync(target);
  } catch {
    report('missing', 'no such file', where);
    return;
  }
  if (info.isDirectory()) {
    target = join(target, 'index.html');
    try {
      statSync(target);
    } catch {
      report('missing', 'directory has no index.html', where);
      return;
    }
  }

  if (!spelledExactly(target)) {
    report('case', 'spelling differs from the file on disk, which only matters once deployed', where);
    return;
  }
  if (!tracked.has(gitPath(target))) {
    report('untracked', 'not tracked by git, so it will not deploy', gitPath(target));
  }
}

/* ---------- run ---------- */

const sources = siteSources();
for (const file of sources) {
  for (const reference of referencesIn(file)) checkReference(file, reference);
}

// soundFile() returns paths relative to the page, but letters.js is what builds
// them, so that is the file worth naming when one is wrong.
const audio = await audioReferences();
const audioBase = join(ROOT, 'oval/index.html');
const audioOrigin = join(ROOT, 'oval/js/letters.js');
for (const reference of audio) checkReference(audioBase, reference, audioOrigin);

// Files sitting in the audio folder that nothing can ask for are dead weight.
const expectedAudio = new Set([...audio].map((reference) => `oval/${reference}`));
const audioDirectory = join(ROOT, 'oval/audio');
try {
  for (const entry of readdirSync(audioDirectory)) {
    if (entry.startsWith('.')) continue;
    if (!expectedAudio.has(`oval/audio/${entry}`)) {
      report('unreferenced', 'nothing in the app can request this', `oval/audio/${entry}`);
    }
  }
} catch {
  report('missing', 'no such file', 'oval/audio');
}

if (!tracked.has('.nojekyll')) {
  report(
    'nojekyll',
    'without a tracked .nojekyll the site is built by Jekyll, which quietly skips files starting with _ or .',
    '.nojekyll'
  );
}

/* ---------- report ---------- */

const pending = pendingChanges();
const KIND_ORDER = ['untracked', 'missing', 'case', 'absolute', 'outside', 'unreferenced', 'nojekyll'];

console.log(`checked ${sources.length} source files in ${gitPath(ROOT) || '.'} for deployment to`);
console.log(`https://<owner>.github.io/${repoName()}/\n`);

if (problems.size === 0) {
  console.log('everything referenced is committed, spelled correctly and reachable under the subpath');
} else {
  const byKind = new Map();
  for (const problem of problems.values()) {
    if (!byKind.has(problem.kind)) byKind.set(problem.kind, []);
    byKind.get(problem.kind).push(problem);
  }
  for (const kind of KIND_ORDER) {
    const group = byKind.get(kind);
    if (!group) continue;
    console.log(`${group.length} ${kind}: ${group[0].message}`);
    for (const problem of group.slice(0, 6)) console.log(`    ${problem.detail}`);
    if (group.length > 6) console.log(`    \u2026and ${group.length - 6} more`);
    console.log();
  }
}

if (pending.length > 0) {
  console.log(`${pending.length} path(s) differ from the last commit, so they are not on the site yet:`);
  for (const change of pending.slice(0, 6)) console.log(`    ${change.state}  ${change.path}`);
  if (pending.length > 6) console.log(`    \u2026and ${pending.length - 6} more`);
}

process.exit(problems.size > 0 ? 1 : 0);
