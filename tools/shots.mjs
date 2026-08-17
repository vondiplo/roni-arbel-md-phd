// Screenshots a page at a few widths, for looking at what the CSS actually did.
//
// Run:  node tools/shots.mjs <path> [outputPrefix]

import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const path = process.argv[2] ?? '';
const prefix = process.argv[3] ?? 'shot';
const WIDTHS = [1280, 900, 390];

const server = await startServer();
const browser = await chromium.launch();

for (const width of WIDTHS) {
  // Chromium skips painting large images in a tall full-page capture when it is
  // also rescaling, so this stays at 1.
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${server.url}${path}`, { waitUntil: 'load' });
  // Reveal animations start at zero opacity and only run once scrolled into
  // view, which a full-page screenshot does not do on its own.
  await page.evaluate(() => {
    document.querySelectorAll('.reveal').forEach((el) => {
      el.style.transition = 'none';
      el.classList.add('in');
    });
  });
  await page.waitForTimeout(600);
  const file = `/tmp/${prefix}-${width}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
  await page.close();
}

await browser.close();
await server.close();
