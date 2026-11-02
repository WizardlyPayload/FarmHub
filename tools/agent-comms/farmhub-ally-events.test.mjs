import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubstantiveReturns } from './farmhub-ally-events.mjs';

test('wakes for substantive FarmHub and any RF release, including direct PARTIAL', () => {
  const text = [
    '## [time] from Tina\r\nACK RF-20261101-TINA-SAVE20-1459 | receipt only',
    '## [time] from Tina\r\nRESULT FARMHUB-ALLY-20261101-VAULT-V8 | PASS',
    '## [time] from Tina\r\nACK FARMHUB-ALLY-20261102-STORAGE-ICONS-I5 | receipt only',
    '## [time] from Tina\r\nRESULT FARMHUB-ALLY-20261102-STORAGE-ICONS-I5 | FAIL',
    '## [time] from Tina\r\nBLOCKED FARMHUB-ALLY-20261102-COMPANIONS-M3: stop gate',
    '## [time] from Tina\r\nRESULT RF-20261101-TINA-SAVE20-1458: BLOCKED at load gate',
    '## [time] from Tina\r\nPARTIAL RF-20261101-TINA-SAVE20-1459: cap gate',
    '## [time] from Tina\r\nCOMPLETE RF-20261101-TINA-PNH-1460 | restored',
  ].join('\r\n\r\n');
  assert.deepEqual(parseSubstantiveReturns(text).map(({ id, kind }) => [id, kind]), [
    ['FARMHUB-ALLY-20261101-VAULT-V8', 'RESULT'],
    ['FARMHUB-ALLY-20261102-STORAGE-ICONS-I5', 'RESULT'],
    ['FARMHUB-ALLY-20261102-COMPANIONS-M3', 'BLOCKED'],
    ['RF-20261101-TINA-SAVE20-1458', 'RESULT'],
    ['RF-20261101-TINA-SAVE20-1459', 'PARTIAL'],
    ['RF-20261101-TINA-PNH-1460', 'COMPLETE'],
  ]);
});

test('normalizing line endings keeps an event hash stable', () => {
  const block = '## [time] from Tina\nRESULT FARMHUB-ALLY-20261101-VAULT-V7R1 | PASS\n';
  assert.equal(parseSubstantiveReturns(block)[0].hash,
    parseSubstantiveReturns(block.replace(/\n/g, '\r\n'))[0].hash);
});
