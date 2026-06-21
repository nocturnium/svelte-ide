// Renders scripts/og-card.html to static/og.png at 1200×630.
// Run: node scripts/render-og.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = 'file://' + path.join(dir, 'og-card.html');
const out = path.join(dir, '..', 'static', 'og.png');

const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 1200, height: 630 },
	deviceScaleFactor: 1
});
await page.goto(src, { waitUntil: 'networkidle' });
await page.screenshot({ path: out });
await browser.close();
console.log('Wrote', out);
