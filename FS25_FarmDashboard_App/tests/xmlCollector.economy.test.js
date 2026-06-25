const { parseEconomyXml } = require('../xmlCollector');

describe('parseEconomyXml (FS25 economy.xml)', () => {
    test('reads price periods nested under history', () => {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<economy>
  <fillTypes>
    <fillType fillType="UNKNOWN"/>
    <fillType fillType="TRITICALE">
      <history>
        <period period="EARLY_SPRING">233</period>
        <period period="LATE_WINTER">233</period>
      </history>
    </fillType>
    <fillType fillType="LEGACY" totalAmount="12">
      <period period="EARLY_SPRING">100</period>
    </fillType>
  </fillTypes>
</economy>`;
        const parsed = parseEconomyXml(xml);
        expect(parsed.TRITICALE).toBeDefined();
        expect(parsed.TRITICALE.history.EARLY_SPRING).toBe(233);
        expect(parsed.TRITICALE.maxPrice).toBe(233);
        expect(parsed.TRITICALE.avgPrice).toBe(233);
        expect(parsed.UNKNOWN).toBeUndefined();
        expect(parsed.LEGACY.history.EARLY_SPRING).toBe(100);
    });
});
