import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubstantiveReturns, shouldWakeFarmHub } from './farmhub-ally-events.mjs';

test('parses substantive FarmHub and RF returns, including direct PARTIAL', () => {
  const text = [
    '## [time] from Tina\r\nACK RF-20261101-TINA-SAVE20-1459 | receipt only',
    '## [time] from Tina\r\nRESULT FARMHUB-ALLY-20261101-VAULT-V8 | PASS',
    '## [time] from Tina\r\nACK FARMHUB-ALLY-20261102-STORAGE-ICONS-I5 | receipt only',
    '## [time] from Tina\r\nRESULT FARMHUB-ALLY-20261102-STORAGE-ICONS-I5 | FAIL',
    '## [time] from Tina\r\nBLOCKED FARMHUB-ALLY-20261102-COMPANIONS-M3: stop gate',
    '## [time] from Tina\r\nBLOCKED RESULT FARMHUB-ALLY-20261102-VAULT-V18 | restored',
    '## [time] from Tina\r\nRESULT RF-20261101-TINA-SAVE20-1458: BLOCKED at load gate',
    '## [time] from Tina\r\nPARTIAL RF-20261101-TINA-SAVE20-1459: cap gate',
    '## [time] from Tina\r\nCOMPLETE RF-20261101-TINA-PNH-1460 | restored',
    '## [time] from Tina\r\nPASS RF-20261102-TINA-LOCAL-LOAD-1479 | restored',
    '## [time] from Tina\r\nFAIL RF-20261102-TINA-MP-JOIN-PROBE-1482: gate',
  ].join('\r\n\r\n');
  assert.deepEqual(parseSubstantiveReturns(text).map(({ id, kind }) => [id, kind]), [
    ['FARMHUB-ALLY-20261101-VAULT-V8', 'RESULT'],
    ['FARMHUB-ALLY-20261102-STORAGE-ICONS-I5', 'RESULT'],
    ['FARMHUB-ALLY-20261102-COMPANIONS-M3', 'BLOCKED'],
    ['FARMHUB-ALLY-20261102-VAULT-V18', 'BLOCKED'],
    ['RF-20261101-TINA-SAVE20-1458', 'RESULT'],
    ['RF-20261101-TINA-SAVE20-1459', 'PARTIAL'],
    ['RF-20261101-TINA-PNH-1460', 'COMPLETE'],
    ['RF-20261102-TINA-LOCAL-LOAD-1479', 'PASS'],
    ['RF-20261102-TINA-MP-JOIN-PROBE-1482', 'FAIL'],
  ]);
});

test('normalizing line endings keeps an event hash stable', () => {
  const block = '## [time] from Tina\nRESULT FARMHUB-ALLY-20261101-VAULT-V7R1 | PASS\n';
  assert.equal(parseSubstantiveReturns(block)[0].hash,
    parseSubstantiveReturns(block.replace(/\n/g, '\r\n'))[0].hash);
});

test('unrelated RF returns stay silent unless an exact release gate is armed', () => {
  const events = parseSubstantiveReturns([
    '## [time] from Tina\nRESULT FARMHUB-ALLY-20261102-STORAGE-ICONS-I6 | pass',
    '## [time] from Tina\nBLOCKED RF-20261102-TINA-VEHICLE-IDENTITY-1486 | restored',
  ].join('\n'));
  assert.deepEqual(events.map(event => shouldWakeFarmHub(event)), [true, false]);
  assert.deepEqual(events.map(event => shouldWakeFarmHub(event, 'RF-20261102-TINA-VEHICLE-IDENTITY-1486')), [true, true]);
  assert.equal(shouldWakeFarmHub(events[1], 'RF-20261102-TINA-VEHICLE-IDENTITY-1484'), false);
});
