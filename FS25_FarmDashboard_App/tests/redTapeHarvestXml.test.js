const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseRedTapeHarvestHistoryXml } = require('../xmlCollector.js');

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<RedTape>
  <infoGatherer>
    <gatherers>
      <farmlandGatherer>
      <farmlands>
        <farmland id="7">
          <harvestedCropsHistory>
            <harvest name="SPINACH" month="19"/>
            <harvest name="SPINACH" month="17"/>
          </harvestedCropsHistory>
        </farmland>
        <farmland id="15">
          <harvestedCropsHistory>
            <harvest name="LINSEED" month="19"/>
          </harvestedCropsHistory>
        </farmland>
      </farmlands>
      </farmlandGatherer>
    </gatherers>
  </infoGatherer>
</RedTape>`;

describe('parseRedTapeHarvestHistoryXml', () => {
    test('parses harvest rows from RedTape.xml', () => {
        const ownership = new Map([[15, 1]]);
        const out = parseRedTapeHarvestHistoryXml(SAMPLE, ownership);
        expect(out.allRows.length).toBe(2);
        expect(out.byFarm['1'].length).toBe(1);
        expect(out.byFarm['1'][0].crops[4]).toBe('Linseed');
    });

    test('returns allRows when farmland ownership is unassigned (farmId 0)', () => {
        const ownership = new Map([[7, 0], [15, 0]]);
        const out = parseRedTapeHarvestHistoryXml(SAMPLE, ownership);
        expect(out.allRows.length).toBe(2);
        expect(Object.keys(out.byFarm).length).toBe(0);
    });

    test('reads real savegame RedTape.xml when present', () => {
        const savePath = path.join(
            os.homedir(),
            'Documents',
            'My Games',
            'FarmingSimulator2025',
            'savegame20',
            'RedTape.xml'
        );
        if (!fs.existsSync(savePath)) return;
        const xml = fs.readFileSync(savePath, 'utf8');
        const ownership = new Map([[15, 1]]);
        const out = parseRedTapeHarvestHistoryXml(xml, ownership);
        expect(out.allRows.length).toBeGreaterThan(0);
    });
});
