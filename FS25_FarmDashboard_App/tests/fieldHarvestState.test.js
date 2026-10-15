'use strict';

const { classifyXmlFieldHarvest } = require('../fieldHarvestState.cjs');

describe('classifyXmlFieldHarvest', () => {
    test('savegame4 field 3: cut wheat + leftover HARVEST_READY ground is harvested, not ready', () => {
        const c = classifyXmlFieldHarvest({
            fruitType: 'WHEAT',
            growthState: 10,
            groundType: 'HARVEST_READY',
        });
        expect(c.harvestReady).toBe(false);
        expect(c.isHarvested).toBe(true);
        expect(c.isWithered).toBe(false);
    });

    test('savegame4 field 2: standing barley at harvestReady index stays ready', () => {
        const c = classifyXmlFieldHarvest({
            fruitType: 'BARLEY',
            growthState: 8,
            groundType: 'HARVEST_READY',
        });
        expect(c.harvestReady).toBe(true);
        expect(c.isHarvested).toBe(false);
    });

    test('savegame4 field 5: standing canola stays ready', () => {
        const c = classifyXmlFieldHarvest({
            fruitType: 'CANOLA',
            growthState: 9,
            groundType: 'HARVEST_READY',
        });
        expect(c.harvestReady).toBe(true);
        expect(c.isHarvested).toBe(false);
    });

    test('HARVEST_READY_OTHER on standing canola is still ready', () => {
        const c = classifyXmlFieldHarvest({
            fruitType: 'CANOLA',
            growthState: 9,
            groundType: 'HARVEST_READY_OTHER',
        });
        expect(c.harvestReady).toBe(true);
        expect(c.isHarvested).toBe(false);
    });

    test('unowned standing wheat gs=8 stays ready', () => {
        const c = classifyXmlFieldHarvest({
            fruitType: 'WHEAT',
            growthState: 8,
            groundType: 'HARVEST_READY',
        });
        expect(c.harvestReady).toBe(true);
        expect(c.isHarvested).toBe(false);
    });

    test('growing sown wheat is not harvest ready', () => {
        const c = classifyXmlFieldHarvest({
            fruitType: 'WHEAT',
            growthState: 4,
            groundType: 'SOWN',
        });
        expect(c.harvestReady).toBe(false);
        expect(c.isHarvested).toBe(false);
    });
});
