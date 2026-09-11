'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = path.join(__dirname, 'tests');
const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => path.join(dir, name));
if (files.length === 0) {
    console.error('No tests/*.test.mjs files found');
    process.exit(1);
}
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status == null ? 1 : result.status);
