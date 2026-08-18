// Loads the built site the way GitHub Pages will serve it and proves it works:
// the reading plays, the alphabet renders, the link from the CV page arrives,
// and nothing 404s or throws along the way.
//
// Run:  node tools/smoke.mjs

import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const failures = [];
const warnings = [];
const expect = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

// Only our own files can fail the run. Google Fonts occasionally 404s a single
// variant, and the page falls back cleanly, so a CDN hiccup must not turn CI red.
const origin = new URL(server.url).origin;
const ours = (url = '') => url.startsWith(origin);
const note = (url, message) => (ours(url) ? failures : warnings).push(message);

page.on('pageerror', (error) => failures.push(`uncaught: ${error.message}`));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  note(message.location()?.url, `console: ${message.text()}`);
});
page.on('requestfailed', (request) => {
  note(request.url(), `request failed: ${request.url()} (${request.failure()?.errorText})`);
});
page.on('response', (response) => {
  if (response.status() >= 400) note(response.url(), `HTTP ${response.status()}: ${response.url()}`);
});

try {
  console.log(`serving at ${server.url}\n`);

  await page.goto(`${server.url}oval/`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.tile').length > 0, { timeout: 30000 });

  const tiles = await page.locator('.tile').count();
  expect('the default reading builds its letter strip', tiles > 0, `${tiles} tiles`);

  const chart = await page.locator('.letter').count();
  expect('the alphabet chart renders all 22 characters', chart === 22, `${chart} characters`);

  const marks = await page.locator('.tile .glyph rect').count();
  expect('characters are drawn as dots and lines', marks > 0, `${marks} marks`);

  // Audio has to decode from the served .wav files for this to advance.
  await page.locator('#stage').scrollIntoViewIfNeeded();
  await page.click('#play');
  await page.waitForFunction(() => Number(document.getElementById('elapsed').textContent) > 0.4, {
    timeout: 15000,
  });
  const elapsed = await page.locator('#elapsed').textContent();
  expect('playback advances through the recording', Number(elapsed) > 0.4, `${elapsed}s`);
  await page.click('#play');

  // Typing reloads different sounds, and the page prints the letters as typed.
  await page.fill('#text', 'HELLO');
  await page.waitForFunction(() => document.querySelectorAll('.tile').length === 5, { timeout: 30000 });
  const captions = await page.locator('.tile-cap').allTextContents();
  expect('typing prints the letters back', captions.join('|') === 'H|E|L|L|O', captions.join('|'));

  // Hebrew is still accepted, and only then does it appear on the page.
  await page.fill('#text', '\u05e9\u05dc\u05d5\u05dd');
  await page.waitForFunction(() => document.querySelectorAll('.tile').length === 4, { timeout: 30000 });
  const hebrew = await page.locator('.tile-cap').allTextContents();
  expect('Hebrew still reads, and shows only when typed',
    hebrew.join('|') === '\u05e9S|\u05dcL|\u05d5E|\u05ddM', hebrew.join('|'));
  const anyHebrewElsewhere = await page.evaluate(() => {
    const outside = [...document.querySelectorAll('.letter, .chip, .kb-key, .hero-lede, .sec-intro')];
    return outside.filter((node) => /[\u0590-\u05FF]/.test(node.textContent)).length;
  });
  expect('nothing else on the page is in Hebrew', anyHebrewElsewhere === 0, `${anyHebrewElsewhere} found`);

  // The poster page is one large image, so a decoded image is the whole test.
  await page.goto(`${server.url}asdp-2026/`, { waitUntil: 'load' });
  const poster = page.locator('.poster-frame img');
  const drawn = await poster.evaluate((img) => img.complete && img.naturalWidth > 0);
  expect('the ASDP poster renders', drawn);
  const fullSize = await page.locator('.poster-frame').getAttribute('href');
  expect('the poster opens at full size', fullSize === 'asdp-2026-poster.jpg', String(fullSize));

  await page.goto(server.url, { waitUntil: 'load' });
  expect('the CV page links to the poster', (await page.locator('a[href="asdp-2026/"]').count()) > 0);
  const link = page.locator('a[href="oval/"]').first();
  expect('the CV page links to the app', (await link.count()) > 0);
  await link.click();
  await page.waitForURL('**/oval/', { timeout: 15000 });
  expect('that link lands on the app', page.url().endsWith('/oval/'), page.url());
  await page.waitForFunction(() => document.querySelectorAll('.tile').length > 0, { timeout: 30000 });
} catch (error) {
  failures.push(`${error.message.split('\n')[0]}`);
} finally {
  await browser.close();
  await server.close();
}

const thirdParty = [...new Set(warnings)];
if (thirdParty.length > 0) {
  console.log(`\n${thirdParty.length} third-party resource(s) did not load, which the page survives:`);
  for (const warning of thirdParty) console.log(`    ${warning}`);
}

if (failures.length > 0) {
  console.log(`\n${failures.length} problem(s) in files this repo serves:`);
  for (const failure of [...new Set(failures)]) console.log(`    ${failure}`);
  process.exit(1);
}
console.log('\nthe site works when served the way GitHub Pages serves it');
