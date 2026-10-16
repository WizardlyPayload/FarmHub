const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.FARMDASH_CAPTURE_URL || 'http://127.0.0.1:8768/';
const chrome = process.env.FARMDASH_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const out = path.join(__dirname, 'doc-screenshots', 'current-5057');
const groups = {
  savegame10: [
    ['enhancedLoanSystem', 'Enhanced Loan System'],
    ['realisticDieselPrice', 'Realistic Diesel Price'],
    ['dynamicMarket', 'Dynamic Market'],
    ['betterContracts', 'Better Contracts'],
    ['seasonalMilkProduction', 'Seasonal Milk Production'],
    ['seasonalWoolProduction', 'Seasonal Wool Production'],
    ['palletDegradation', 'Pallet Degradation'],
    ['realSilo', 'RealSilo'],
    ['restrictedPeriods', 'Restricted Periods'],
    ['regionalCropCalendar', 'Regional Crop Calendar'],
  ],
  savegame18: [
    ['iNeedALoan', 'I Need A Loan'],
    ['automaticLoanRepay', 'Automatic Loan Repay'],
    ['realisticAnimalLosses', 'Realistic Animal Losses'],
    ['animalFoodOverview', 'Animal Food Overview'],
    ['animalFoodCalculator', 'Animal Food Calculator'],
    ['factoryProfitCalculator', 'Factory Profit Calculator'],
    ['moistureSystem', 'Moisture System'],
    ['fieldLeasing', 'Field Leasing'],
    ['smartCropControl', 'Smart Crop Control'],
  ],
  savegame3: [['fluctuatingDieselPrice', 'Fluctuating Diesel Price']],
};

function sourceFor(servers, slot) {
  const source = servers.find((server) => String(server.localSubFolder || '').toLowerCase() === slot);
  if (!source) throw new Error(`No configured source for ${slot}`);
  return String(source.id);
}

async function scrubSettings(page, serverNames) {
  await page.evaluate((names) => {
    const replace = (value) => {
      let result = String(value);
      for (const name of names) {
        if (name && name.length > 2) result = result.split(name).join('Example Farm');
      }
      return result
        .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '192.0.2.10')
        .replace(/[A-Za-z]:\\[^\r\n]+/g, 'C:\\Example\\FarmDashboard')
        .replace(/Graham/gi, 'Player');
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue) node.nodeValue = replace(node.nodeValue);
    }
    for (const input of document.querySelectorAll('input[type="text"],input[type="password"],textarea')) {
      input.value = 'Example (hidden)';
    }
  }, serverNames);
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const raw = await (await fetch(new URL('/api/servers', base))).json();
  const servers = Array.isArray(raw) ? raw : raw.servers || [];
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const index = [];

  async function shot(file, details, masks = []) {
    await page.screenshot({
      path: path.join(out, file),
      type: 'png',
      fullPage: false,
      mask: masks,
      maskColor: '#324653',
    });
    index.push({ file, width: 1920, height: 1080, capturedAt: new Date().toISOString(), ...details });
    process.stdout.write(`captured ${file} 1920x1080\n`);
  }

  try {
    for (const [slot, pages] of Object.entries(groups)) {
      const sourceId = sourceFor(servers, slot);
      for (const [key, title] of pages) {
        await page.goto(new URL(`#mod-${key}`, base).href, { waitUntil: 'domcontentloaded' });
        await page.locator('.fd-topbar__save-select').selectOption(sourceId);
        await page.waitForFunction(({ expected }) => {
          const root = document.querySelector('.fd-main__content');
          if (!root) return false;
          const heading = root.querySelector('h1,h2');
          const text = root.innerText;
          return heading?.textContent?.trim() === expected &&
            text.includes('About this mod') &&
            !text.includes('Not detected in this save');
        }, { expected: title }, { timeout: 15000 });
        await page.waitForTimeout(400);
        const content = page.locator('.fd-main__content');
        await content.evaluate((element) => { element.scrollTop = 0; });
        const textChars = (await content.innerText()).trim().length;
        await shot(`mod-${key}.png`, { kind: 'companion', slot, title, textChars, position: 'top' });
        const dimensions = await content.evaluate((element) => ({
          visible: element.clientHeight,
          total: element.scrollHeight,
        }));
        if (dimensions.total > dimensions.visible + 180) {
          await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
          await page.waitForTimeout(150);
          await shot(`mod-${key}-lower.png`, { kind: 'companion', slot, title, textChars, position: 'lower' });
        }
      }
    }

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const masks = [dialog.locator('input[type="text"],input[type="password"],textarea')];
    const serverNames = servers.map((server) => String(server.name || '')).filter(Boolean);

    async function settings(tab, name, position = 'top', theme = null) {
      await dialog.getByRole('button', { name: tab, exact: true }).click();
      if (theme) await dialog.locator('select').last().selectOption({ label: theme });
      await page.waitForTimeout(500);
      await scrubSettings(page, serverNames);
      const pane = dialog.locator('.fd-settings__pane');
      await pane.evaluate((element, where) => {
        const maximum = element.scrollHeight - element.clientHeight;
        element.scrollTop = where === 'lower' ? maximum : where === 'middle' ? maximum / 2 : 0;
      }, position);
      await page.waitForTimeout(100);
      await shot(`settings-${name}.png`, { kind: 'settings', tab, position, theme }, masks);
    }

    await settings('Dashboard', 'dashboard-top');
    await settings('Dashboard', 'dashboard-lower', 'lower');
    await settings('Servers & saves', 'servers-top');
    await settings('Servers & saves', 'servers-middle', 'middle');
    await settings('Servers & saves', 'servers-lower', 'lower');
    await settings('FS25 mod', 'fs25-mod');
    for (const [label, file] of [
      ['Global Default', 'appearance-global'],
      ['Vehicles Tab', 'appearance-vehicles'],
      ['Fields Tab', 'appearance-fields'],
      ['Economy Tab', 'appearance-economy'],
      ['Pastures Tab', 'appearance-pastures'],
    ]) await settings('Appearance', file, 'top', label);
    await settings('Health', 'health');
    await settings('About', 'about-top');
    await settings('About', 'about-lower', 'lower');

    fs.writeFileSync(path.join(out, 'detail-capture-index.json'), JSON.stringify(index, null, 2) + '\n');
    process.stdout.write(`completed ${index.length} detailed screenshots\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
