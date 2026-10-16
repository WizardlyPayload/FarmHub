/* Read-only, headless capture of the installed V5 UI and existing demo sources. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.FARMDASH_CAPTURE_URL || 'http://127.0.0.1:8768/';
const out = path.join(__dirname, 'doc-screenshots', 'current-5057');
const chrome = process.env.FARMDASH_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const jobs = [
  ...['overview', 'fields', 'vehicles', 'pastures', 'productions', 'storage', 'economy', 'map'].map(route => ({slot:'savegame4',route,file:`base-${route}.png`})),
  ...['overview', 'fields', 'vehicles', 'pastures', 'productions', 'storage', 'economy', 'map'].map(route => ({slot:'savegame10',route,file:`suite-${route}.png`})),
  {slot:'savegame18',route:'fields',file:'pf-fields.png'},
  ...['redtape','hirepurchasing'].map(route => ({slot:'savegame10',route,file:`suite-${route}.png`})),
  ...['ads','npcfavor','worldevents','prostaff','fertilizerdepot'].map(route => ({slot:'savegame19',route,file:`suite-${route}.png`})),
  ...['enhancedLoanSystem','realisticDieselPrice','dynamicMarket','betterContracts','seasonalMilkProduction','seasonalWoolProduction','palletDegradation','realSilo','restrictedPeriods','regionalCropCalendar'].map(key => ({slot:'savegame10',route:`mod-${key}`,file:`mod-${key}.png`})),
  ...['iNeedALoan','automaticLoanRepay','realisticAnimalLosses','animalFoodOverview','animalFoodCalculator','factoryProfitCalculator','moistureSystem','fieldLeasing','smartCropControl'].map(key => ({slot:'savegame18',route:`mod-${key}`,file:`mod-${key}.png`})),
  {slot:'savegame3',route:'mod-fluctuatingDieselPrice',file:'mod-fluctuatingDieselPrice.png'},
];
async function main() {
  const servers = await (await fetch(new URL('/api/servers', base))).json();
  const bySlot = new Map(servers.map(server => [server.localSubFolder, server]));
  for (const slot of new Set(jobs.map(job => job.slot))) if (!bySlot.has(slot)) throw new Error(`Missing demo source ${slot}; no substitute used`);
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({headless:true,executablePath:chrome});
  const page = await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const index = [];
  try {
    for (const job of jobs) {
      const server = bySlot.get(job.slot);
      const url = new URL(base);
      url.hash = job.route === 'overview' ? '#/' : `#/${job.route}`;
      await page.goto(url.toString(),{waitUntil:'domcontentloaded',timeout:30000});
      const save = page.locator('.fd-topbar__save-select');
      await save.waitFor({timeout:30000});
      await save.selectOption(server.id);
      await page.waitForTimeout(1500);
      if (await save.inputValue() !== server.id) throw new Error(`Wrong source for ${job.file}`);
      const content = page.locator('.fd-main__content');
      await content.waitFor({timeout:30000});
      const textChars = (await content.innerText()).trim().length;
      await page.screenshot({path:path.join(out,job.file),type:'png',fullPage:false});
      index.push({file:job.file,slot:job.slot,source:server.name,route:job.route,sourceState:server.sourceBinding?.stateStatus || 'unknown',capturedAt:new Date().toISOString()});
      process.stdout.write(`captured ${job.file} from ${job.slot}\n`);
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out,'capture-index.json'),JSON.stringify(index,null,2)+'\n');
}
main().catch(error => {console.error(error);process.exitCode=1;});
