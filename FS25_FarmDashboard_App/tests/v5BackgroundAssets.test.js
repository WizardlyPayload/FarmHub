const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const webRoot = path.join(repoRoot, 'FS25_FarmDashboard_App', 'web');
const sectionMeta = fs.readFileSync(path.join(repoRoot, 'NEW APP', 'src', 'app', 'section-meta.ts'), 'utf8');
const splash = fs.readFileSync(path.join(repoRoot, 'NEW APP', 'src', 'components', 'SplashScreen.tsx'), 'utf8');

function resolveWithExactCase(url) {
  let parent = webRoot;
  for (const segment of decodeURIComponent(url).replace(/^\/+/, '').split('/')) {
    expect(fs.readdirSync(parent)).toContain(segment);
    parent = path.join(parent, segment);
  }
  expect(fs.statSync(parent).isFile()).toBe(true);
}

test('every V5 section background and splash image resolves with the exact packaged case', () => {
  const base = '/assests/img/Dashboard%20PIctures';
  const backgroundNames = Array.from(
    sectionMeta.matchAll(/\$\{DASHBOARD_PICTURES_BASE\}\/([^`]+)`/g),
    (match) => match[1],
  );
  expect(backgroundNames.length).toBeGreaterThan(10);
  for (const name of backgroundNames) resolveWithExactCase(`${base}/${name}`);

  const splashUrls = Array.from(splash.matchAll(/const SPLASH_(?:BG|LOGO) = "([^"]+)";/g), (match) => match[1]);
  expect(splashUrls).toHaveLength(2);
  for (const url of splashUrls) resolveWithExactCase(url);
});
