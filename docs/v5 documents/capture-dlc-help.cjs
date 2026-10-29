/* Read-only, full-viewport captures from an explicitly named local DLC save. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.FARMDASH_CAPTURE_URL || 'http://127.0.0.1:8768/';
const out = process.env.FARMDASH_CAPTURE_OUT || path.join(__dirname, 'doc-screenshots', 'current-527');
const chrome = process.env.FARMDASH_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const slot = process.env.FARMDASH_CAPTURE_SLOT || 'savegame17';
const routes = ['overview', 'orchards', 'productions', 'map'];

async function main() {
  const status = await (await fetch(new URL('/api/status', base))).json();
  if (status.appVersion !== '5.2.7') throw new Error(`Expected installed app 5.2.7, got ${status.appVersion}`);
  const servers = await (await fetch(new URL('/api/servers', base))).json();
  const source = servers.find(server => server.localSubFolder === slot);
  if (!source) throw new Error(`Source ${slot} is not registered; no substitute used`);
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const index = [];
  fs.mkdirSync(out, { recursive: true });
  try {
    for (const route of routes) {
      const url = new URL(base);
      url.hash = '#/overview';
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      const select = page.locator('.fd-topbar__save-select');
      await select.waitFor({ timeout: 30000 });
      await select.selectOption(source.id);
      await page.waitForTimeout(1500);
      if (await select.inputValue() !== source.id) throw new Error(`Wrong source for ${route}`);
      await page.evaluate(value => { window.location.hash = `#/${value}`; }, route);
      await page.waitForFunction(value => document.querySelector('.fd-main')?.getAttribute('data-section') === value,
        route, { timeout: 15000 });
      const content = page.locator('.fd-main__content');
      await content.waitFor({ timeout: 30000 });
      await page.waitForFunction(() => (document.querySelector('.fd-main__content')?.innerText || '').trim().length >= 80,
        null, { timeout: 15000 });
      if (route === 'orchards') {
        await page.getByText('Coffee cherries', { exact: false }).first().waitFor({ timeout: 15000 });
        await page.getByText('Bananas', { exact: false }).first().waitFor({ timeout: 15000 });
      }
      if (route === 'map') await page.locator('.farm-fleet-map-stage--has-overview').waitFor({ timeout: 15000 });
      if (route === 'map') {
        await page.locator('.farm-fleet-map-stage--has-overview img').first().evaluate(async image => {
          if (!image.complete || image.naturalWidth < 100) await image.decode();
          if (image.naturalWidth < 100) throw new Error('Map overview image did not decode');
        });
      } else await page.evaluate(async () => {
        const bg = document.querySelector('.fd-main__bg');
        if (!bg) throw new Error('Section background missing');
        const match = getComputedStyle(bg).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
        if (!match) throw new Error('Section background URL missing');
        const image = new Image(); image.src = match[1]; await image.decode();
      });
      const file = `catua-${route}.png`;
      await page.screenshot({ path: path.join(out, file), type: 'png', fullPage: false });
      index.push({ file, slot, source: source.name, route, width: 1920, height: 1080,
        sourceState: source.sourceBinding?.stateStatus || 'unknown', capturedAt: new Date().toISOString() });
      process.stdout.write(`captured ${file}\n`);
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'dlc-capture-index.json'), JSON.stringify(index, null, 2) + '\n');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
