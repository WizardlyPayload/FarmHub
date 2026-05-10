/**
 * Regression: fields.xml may nest <field> under fieldStates (or similar), not only fields.field.
 */

describe('xmlCollector field extraction', () => {
    test('parses fields nested under fieldStates (FS25-style)', () => {
        const { XMLParser } = require('fast-xml-parser');
        const ARRAY_TAGS = new Set([
            'mod', 'farmland', 'field', 'farm', 'player', 'instance', 'vehicle', 'unit',
            'component', 'placeable', 'fillType', 'period', 'farmlandStatistic', 'fieldStates',
        ]);
        const xmlParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            textNodeName: '#text',
            parseAttributeValue: true,
            trimValues: true,
            isArray: (tagName) => ARRAY_TAGS.has(tagName),
        });
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<fields>
  <fieldStates>
    <field id="42" fruitType="WHEAT" growthState="4" groundType="SOWN" weedState="0"
      limeLevel="1" sprayLevel="1" sprayType="NONE" plowLevel="1" stubbleShredLevel="0"
      lastGrowthState="4" plannedFruit="WHEAT" stoneLevel="0" rollerLevel="0"/>
  </fieldStates>
</fields>`;
        const doc = xmlParser.parse(xml);
        function unwrapDoc(parsed) {
            if (!parsed || typeof parsed !== 'object') return null;
            const keys = Object.keys(parsed).filter((k) => k !== '?xml');
            if (keys.length === 1) return parsed[keys[0]];
            return parsed;
        }
        function attrs(el) {
            const out = {};
            if (!el || typeof el !== 'object') return out;
            for (const [k, v] of Object.entries(el)) {
                if (k.startsWith('@_')) out[k.slice(2)] = v;
            }
            return out;
        }
        function ensureArray(x) {
            if (x === undefined || x === null) return [];
            return Array.isArray(x) ? x : [x];
        }
        function collectTagRecursive(node, tagName, out = []) {
            if (!node || typeof node !== 'object') return out;
            if (Array.isArray(node)) {
                node.forEach((x) => collectTagRecursive(x, tagName, out));
                return out;
            }
            for (const [k, v] of Object.entries(node)) {
                if (k === tagName) {
                    ensureArray(v).forEach((x) => out.push(x));
                } else if (typeof v === 'object' && k !== '?xml' && !k.startsWith('@_')) {
                    collectTagRecursive(v, tagName, out);
                }
            }
            return out;
        }
        const root = unwrapDoc(doc) || doc;
        const flatOnly = ensureArray(root.field);
        const nested = collectTagRecursive(root, 'field', []);
        expect(flatOnly.length).toBe(0);
        expect(nested.length).toBe(1);
        expect(attrs(nested[0]).id).toBeDefined();
        expect(parseInt(String(attrs(nested[0]).id), 10)).toBe(42);
    });
});
