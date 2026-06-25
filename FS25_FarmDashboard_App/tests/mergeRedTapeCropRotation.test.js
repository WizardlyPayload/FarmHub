const { mergeRedTapeCropRotation } = require('../dataMerger.js');
const { redTapeSectionEmpty } = require('../mergedSnapshotHold.js');

describe('mergeRedTapeCropRotation', () => {
    test('does not create a stub farm from XML when live redTape is empty', () => {
        const out = mergeRedTapeCropRotation(
            { enabled: true, byFarm: {} },
            { allRows: [{ farmlandId: 2, crops: ['', '', '', '', 'Wheat'] }] }
        );
        expect(Object.keys(out.byFarm).length).toBe(0);
    });

    test('adds cropRotation to an existing farm without wiping policies', () => {
        const lua = {
            enabled: true,
            byFarm: {
                '1': {
                    tier: 'C',
                    points: 350,
                    policies: [{ policyIndex: 1, nameKey: 'rt_policy_croprotation' }],
                    events: [{ detail: 'test' }],
                    availableSchemes: [{ nameKey: 'rt_scheme_x' }],
                },
            },
        };
        const out = mergeRedTapeCropRotation(lua, {
            allRows: [{ farmlandId: 7, crops: ['', '', '', '', 'Spinach'] }],
        });
        expect(out.byFarm['1'].policies.length).toBe(1);
        expect(out.byFarm['1'].events.length).toBe(1);
        expect(out.byFarm['1'].cropRotation.length).toBe(1);
    });

    test('crop-only farm counts as empty for snapshot hold', () => {
        const empty = redTapeSectionEmpty({
            enabled: true,
            byFarm: { '1': { cropRotation: [{ farmlandId: 1, crops: ['Wheat'] }] } },
        });
        expect(empty).toBe(true);
    });
});
