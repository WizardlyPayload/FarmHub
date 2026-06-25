const fs = require('fs');
const path = require('path');
const {
    parseMoistureSystemXml,
    enrichStockMoistureFromXml,
} = require('../stockMoistureFromXml');

describe('stockMoistureFromXml', () => {
    test('parseMoistureSystemXml reads object moisture entries', () => {
        const xml = `<?xml version="1.0"?>
<MoistureSystem>
  <objectMoisture>
    <object uniqueId="placeablee76429fe542ad47274bbffb2087544bf">
      <fillType name="WHEAT" moisture="0.112110" quality="98.901947"/>
      <fillType name="POPPY" moisture="0.100403" quality="94.949989"/>
    </object>
  </objectMoisture>
</MoistureSystem>`;
        const parsed = parseMoistureSystemXml(xml);
        const row = parsed.byObjectUid.placeablee76429fe542ad47274bbffb2087544bf;
        expect(row.WHEAT.moisturePct).toBe(11.2);
        expect(row.WHEAT.qualityPct).toBe(99);
        expect(row.POPPY.moisturePct).toBe(10);
    });

    test('enrichStockMoistureFromXml patches silo rows by placeable + fill type', () => {
        const moistureSystem = parseMoistureSystemXml(
            fs.readFileSync(
                path.join(__dirname, 'fixtures', 'moistureSystem.sample.xml'),
                'utf8'
            )
        );
        const stock = {
            byFarm: {
                '1': {
                    items: [{
                        fillType: 'WHEAT',
                        fillTypeIndex: 2,
                        locations: [{
                            kind: 'silo',
                            name: 'NL16-22 - 2000',
                            liters: 120304,
                        }],
                    }],
                },
            },
        };
        const placeables = [{
            uniqueId: 'placeablee76429fe542ad47274bbffb2087544bf',
            farmId: 1,
            filename: 'data/placeables/neuero/nl1622_2000/nl1622_2000.xml',
            siloFillTypes: ['WHEAT', 'POPPY'],
        }];
        const out = enrichStockMoistureFromXml(stock, moistureSystem, placeables, { '2': 'WHEAT' });
        const loc = out.byFarm['1'].items[0].locations[0];
        expect(loc.moisturePct).toBe(11.2);
        expect(loc.qualityPct).toBe(99);
    });

    test('does not overwrite existing lua moisture', () => {
        const moistureSystem = parseMoistureSystemXml(
            '<objectMoisture><object uniqueId="uid1"><fillType name="WHEAT" moisture="0.5" quality="50"/></object></objectMoisture>'
        );
        const stock = {
            byFarm: {
                '1': {
                    items: [{
                        fillType: 'WHEAT',
                        fillTypeIndex: 2,
                        locations: [{ kind: 'silo', name: 'Silo', liters: 1, moisturePct: 9.1, qualityPct: 91 }],
                    }],
                },
            },
        };
        const out = enrichStockMoistureFromXml(stock, moistureSystem, [{ uniqueId: 'uid1', siloFillTypes: ['WHEAT'] }], {});
        expect(out.byFarm['1'].items[0].locations[0].moisturePct).toBe(9.1);
    });
});
