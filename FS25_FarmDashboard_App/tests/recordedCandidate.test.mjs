import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRecordedCandidate } from '../../NEW APP/scripts/recorded-candidate.mjs';
import { parseGeneration, recordedFeatureSection } from '../../NEW APP/src/platform/recorded-publication.ts';

const now = Date.parse('2026-10-26T01:01:00.000Z');
function snapshot() {
  return {
    sourceBinding: {
      bindingId: 'source-1', stateStatus: 'snapshot',
      exportIdentity: { careerId: 'career-1', sessionId: 'session-1', exportGeneration: 421, publicationSequence: 704 },
    },
    serverInfo: { saveSlot: 'savegame4', host: 'private-host' },
    mapTitle: 'Riverbend Springs',
    farmInfo: [{ id: 1, name: 'Player Private Farm', money: 100 }],
    fields: [{ id: 15, fieldId: 15, ownerFarmId: 1, name: 'Field 15', hectares: 3.2, groundType: 7 }],
    gameTime: { year: 3, period: 4 },
    luaAvailable: true,
    dataTimestamps: { lastLuaReceivedAt: '2026-10-26T01:00:00.000Z' },
  };
}
const selection = { demoId: 'base', sections: ['fields'], farmId: 1, sourceSlot: 'savegame4' };

test('completed current source yields a bounded public candidate with original sample time and no host/farm identity', () => {
  const input = snapshot();
  const candidate = makeRecordedCandidate(input, selection, now);
  assert.equal(candidate.exportGeneration, 421);
  assert.equal(candidate.publicationSequence, 704);
  assert.equal(candidate.capturedAt, '2026-10-26T01:00:00.000Z');
  assert.equal(candidate.gameDate, 'Year 3, period 4');
  assert.equal(candidate.payload.fields[0].groundType, 7);
  assert.equal(candidate.payload.farmInfo[0].name, 'Farm 1');
  assert.ok(parseGeneration(JSON.stringify(candidate), candidate.id));
  const text = JSON.stringify(candidate);
  assert.ok(!text.includes('private-host'));
  assert.ok(!text.includes('Player Private Farm'));
  assert.equal(input.farmInfo[0].name, 'Player Private Farm');
});

test('held, stale, wrong-save, wrong-farm and private selected readings fail closed', () => {
  const held = snapshot(); held.sourceBinding.stateStatus = 'held';
  assert.throws(() => makeRecordedCandidate(held, selection, now), /uncommitted-or-held-source/);
  const uncommitted = snapshot(); uncommitted.sourceBinding.exportIdentity.exportGeneration = 0;
  assert.throws(() => makeRecordedCandidate(uncommitted, selection, now), /uncommitted-or-held-source/);
  assert.throws(() => makeRecordedCandidate(snapshot(), selection, now + 6 * 60_000), /stale-or-unverified-source/);
  assert.throws(() => makeRecordedCandidate(snapshot(), { ...selection, sourceSlot: 'savegame3' }, now), /wrong-save-slot/);
  assert.throws(() => makeRecordedCandidate(snapshot(), { ...selection, farmId: 2 }, now), /farm-not-in-source/);
  const privateField = snapshot(); privateField.fields[0].password = 'hidden';
  assert.throws(() => makeRecordedCandidate(privateField, selection, now), /projection:private-field/);
});

test('missing or unpopulated advertised sections cannot become feature links', () => {
  assert.throws(() => makeRecordedCandidate(snapshot(), { ...selection, sections: ['economy'] }, now), /missing-section:economy/);
  const empty = snapshot(); empty.fields = [];
  assert.throws(() => makeRecordedCandidate(empty, selection, now), /empty-section:fields/);
  assert.throws(() => makeRecordedCandidate(snapshot(), { ...selection, sections: ['mod-everythingConstructable'] }, now), /missing-section:mod-everythingConstructable/);
});

test('Everything Constructable capture keeps only the selected farm and opens a populated mod page', () => {
  const input = snapshot();
  input.companionPages = { pages: {
    everythingConstructable: {
      key: 'everythingConstructable', detected: true, readState: 'ok', coverage: 'complete',
      byFarm: {
        '1': { siteCount: 1, pausedCount: 1, pendingMaterials: 1, remainingCost: 250 },
        '2': { siteCount: 1, pausedCount: 0, pendingMaterials: 1, remainingCost: 999 },
      },
      projects: [
        { id: 12, farmId: 1, name: 'Farm workshop', mode: 'paused', phase: 2, phaseCount: 4,
          progress: 0.5, remainingCost: 250, materials: [{ fillType: 'WOOD', required: 100, delivered: 40, remaining: 60 }] },
        { id: 13, farmId: 2, name: 'Other farm site', mode: 'automatic', phase: 1, phaseCount: 2,
          progress: 0, remainingCost: 999, materials: [] },
      ],
    },
    betterContracts: { detected: true, privateNotes: 'other farm private notes' },
  } };
  const selected = { ...selection, demoId: 'precision-companions', sections: ['mod-everythingConstructable'] };
  const candidate = makeRecordedCandidate(input, selected, now);
  assert.equal(candidate.section, 'mod-everythingConstructable');
  const page = candidate.payload.companionPages.pages.everythingConstructable;
  assert.deepEqual(Object.keys(candidate.payload.companionPages.pages), ['everythingConstructable']);
  assert.deepEqual(Object.keys(page.byFarm), ['1']);
  assert.equal(page.projects.length, 1);
  assert.equal(page.projects[0].farmId, 1);
  assert.equal(page.projects[0].materials[0].remaining, 60);
  assert.ok(!JSON.stringify(candidate).includes('Other farm site'));
  assert.ok(!JSON.stringify(candidate).includes('private notes'));
  assert.ok(parseGeneration(JSON.stringify(candidate), candidate.id));
  assert.deepEqual(recordedFeatureSection(candidate.payload, 'mod-everythingConstructable', 'mod-everythingConstructable'),
    { ok: true, section: 'mod-everythingConstructable' });

  const noSites = structuredClone(input);
  noSites.companionPages.pages.everythingConstructable.projects = [];
  assert.throws(() => makeRecordedCandidate(noSites, selected, now), /empty-section:mod-everythingConstructable/);
  const privateSite = structuredClone(input);
  privateSite.companionPages.pages.everythingConstructable.projects[0].password = 'secret';
  assert.throws(() => makeRecordedCandidate(privateSite, selected, now), /projection:private-field/);

  const ownerlessSite = structuredClone(input);
  delete ownerlessSite.companionPages.pages.everythingConstructable.projects[0].farmId;
  assert.throws(() => makeRecordedCandidate(ownerlessSite, selected, now), /projection:missing-farm/);

  const emptySite = structuredClone(input);
  emptySite.companionPages.pages.everythingConstructable.projects = [{}];
  assert.throws(() => makeRecordedCandidate(emptySite, selected, now), /projection:missing-farm/);

  const wrongPage = structuredClone(input);
  wrongPage.companionPages.pages.everythingConstructable.key = 'otherMod';
  assert.throws(() => makeRecordedCandidate(wrongPage, selected, now), /empty-section:mod-everythingConstructable/);
});
