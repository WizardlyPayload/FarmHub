import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubstantiveReturns, shouldWakeFarmHub, firstRfRequestAfterHandoff } from './farmhub-ally-events.mjs';

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
    '## [time] from Tina\r\nSTALL RF-20261102-TINA-SERVERREADY-1499 (Tina/Ally): restored',
    '## [time] from Tina\r\nPARTIAL + INCIDENT FARMHUB-ALLY-20261107-VAULT-V53 (save missing): stop',
    '## [time] from Tina\r\nBLOCKED (no exact copy found) FARMHUB-ALLY-20261107-V53-RECOVERY-AUDIT - retained backup',
    '## [time] from Tina\r\nRESULT RF-SOIL-1443-CELLIDENTITY-20261114-TINA-2235 | restored',
    '## [time] from Tina\r\nRESULT-FARMHUB-ALLY-20261116-VAULT-V125 (Tina): BLOCKED at StockGuard',
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
    ['RF-20261102-TINA-SERVERREADY-1499', 'STALL'],
    ['FARMHUB-ALLY-20261107-VAULT-V53', 'PARTIAL'],
    ['FARMHUB-ALLY-20261107-V53-RECOVERY-AUDIT', 'BLOCKED'],
    ['RF-SOIL-1443-CELLIDENTITY-20261114-TINA-2235', 'RESULT'],
    ['FARMHUB-ALLY-20261116-VAULT-V125', 'RESULT'],
  ]);
});

test('normalizing line endings keeps an event hash stable', () => {
  const block = '## [time] from Tina\nRESULT FARMHUB-ALLY-20261101-VAULT-V7R1 | PASS\n';
  assert.equal(parseSubstantiveReturns(block)[0].hash,
    parseSubstantiveReturns(block.replace(/\n/g, '\r\n'))[0].hash);
});

test('a combined pickup and substantive return wakes, while pickup alone does not', () => {
  const events = parseSubstantiveReturns([
    '## [time] from Tina\nPICKUP FARMHUB-ALLY-20261115-VAULT-V122R1 | starting',
    '## [time] from Tina\nPICKUP+RESULT FARMHUB-ALLY-20261115-VAULT-V122R1 (Ally 20:45-21:20): PARTIAL',
    '## PICKUP+BLOCKED RF-SOIL-1141-CP-20261115-TINA-2043: safe stop',
  ].join('\n\n'));
  assert.deepEqual(events.map(({ id, kind }) => [id, kind]), [
    ['FARMHUB-ALLY-20261115-VAULT-V122R1', 'RESULT'],
    ['RF-SOIL-1141-CP-20261115-TINA-2043', 'BLOCKED'],
  ]);
});

test('parses a substantive result in Tina\'s Markdown heading without treating ACK as a result', () => {
  const events = parseSubstantiveReturns([
    '## ACK FARMHUB-ALLY-20261114-VAULT-V98 | receipt only',
    '## RESULT FARMHUB-ALLY-20261114-VAULT-V98 | Tina | PASS',
  ].join('\n\n'));
  assert.deepEqual(events.map(({ id, kind }) => [id, kind]), [
    ['FARMHUB-ALLY-20261114-VAULT-V98', 'RESULT'],
  ]);
});

test('unrelated RF returns stay silent unless an exact release gate is armed', () => {
  const events = parseSubstantiveReturns([
    '## [time] from Tina\nRESULT FARMHUB-ALLY-20261102-STORAGE-ICONS-I6 | pass',
    '## [time] from Tina\nBLOCKED RF-20261102-TINA-VEHICLE-IDENTITY-1486 | restored',
  ].join('\n'));
  assert.deepEqual(events.map(event => shouldWakeFarmHub(event)), [true, false]);
  assert.deepEqual(events.map(event => shouldWakeFarmHub(event, 'RF-20261102-TINA-VEHICLE-IDENTITY-1486')), [true, true]);
  assert.equal(shouldWakeFarmHub(events[1], 'RF-20261102-TINA-VEHICLE-IDENTITY-1484'), false);
  const soil = parseSubstantiveReturns('## RESULT RF-SOIL-1443-CELLIDENTITY-20261114-TINA-2235 | restored')[0];
  assert.equal(shouldWakeFarmHub(soil), false);
  assert.equal(shouldWakeFarmHub(soil, soil.id), true);
  const shortId = parseSubstantiveReturns('## [time] from Tina\nRESULT RF-SOIL-1141-20261115-TINA | released')[0];
  assert.equal(shortId.id, 'RF-SOIL-1141-20261115-TINA');
  assert.equal(shouldWakeFarmHub(shortId, ['RF-SOIL-1141-20261115-TINA-1929', shortId.id]), true);
  assert.equal(shouldWakeFarmHub({ id: 'RF-SOIL-1141-20261115-TINA', kind: 'RESULT' }, [
    'RF-SOIL-1141-20261115-TINA-1929', 'RF-SOIL-1141-20261115-TINA',
  ]), true);
  assert.equal(shouldWakeFarmHub({ id: 'RF-OTHER-20261115-TINA', kind: 'RESULT' }, [
    'RF-SOIL-1141-20261115-TINA-1929', 'RF-SOIL-1141-20261115-TINA',
  ]), false);
  assert.equal(shouldWakeFarmHub(
    { id: 'RF-SOIL-1143-DECIMAL-20261115-TINA', kind: 'RESULT' },
    'RF-SOIL-1143-DECIMAL-20261115-TINA-2357',
  ), true);
  assert.equal(shouldWakeFarmHub(
    { id: 'RF-SOIL-1143-DECIMAL-20261115-TINA', kind: 'RESULT' },
    'RF-SOIL-1143-OTHER-20261115-TINA-2357',
  ), false);
});

test('resolves only the first RF request after an explicit Ally handoff', () => {
  const ledger = [
    '## RF-20261102-TINA-OLD-1494 — old request',
    '## FARMHUB-V18-ALLY-HANDOFF | FarmHub | 2026-11-02',
    'RF may take the next window.',
    '## [2026-11-02 15:34:50 UTC] SERVER READY RF-20261102-TINA-NEXT-1495 — queued',
    '## RF-20261102-TINA-LATER-1496 — queued',
  ].join('\n');
  assert.equal(firstRfRequestAfterHandoff(ledger, 'FARMHUB-V18-ALLY-HANDOFF'),
    'RF-20261102-TINA-NEXT-1495');
  assert.equal(firstRfRequestAfterHandoff(ledger, 'MISSING-HANDOFF'), '');
});
