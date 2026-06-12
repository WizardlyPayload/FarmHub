const cjs = require('../farmScope.cjs');
const fs = require('fs');
const path = require('path');

describe('farmScope browser/cjs parity', () => {
  const browserSrc = fs.readFileSync(
    path.join(__dirname, '../web/assests/js/modules/farmScope.js'),
    'utf8'
  );

  test('browser module exports same public function names as farmScope.cjs', () => {
    for (const name of Object.keys(cjs)) {
      expect(browserSrc).toMatch(new RegExp(`export function ${name}\\(`));
    }
  });
});
