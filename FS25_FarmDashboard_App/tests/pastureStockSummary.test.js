'use strict';

/**
 * Contract tests for pasture summary rules (measured 0 stays 0; synth is not 0% health).
 * Loads the production TypeScript function; no copied algorithm.
 */

const { productionFunctions } = require('./helpers/production-source.cjs');
const { summarizePastureAnimals } = productionFunctions(
    'NEW APP/src/lib/pastures-parsers.ts', ['pastureHeadWeight', 'isUnmeasuredSynthAnimal', 'summarizePastureAnimals'],
);

describe('pasture stock summary contract', () => {
    test('husbandry-only empty animals is unknown health, not 0%', () => {
        const s = summarizePastureAnimals([]);
        expect(s.avgHealthKnown).toBe(false);
        expect(s.maleCount).toBe(0);
        expect(s.femaleCount).toBe(0);
    });

    test('measured zero health stays zero and known', () => {
        const s = summarizePastureAnimals([{ gender: 'female', health: 0 }]);
        expect(s.avgHealthKnown).toBe(true);
        expect(s.avgHealth).toBe(0);
        expect(s.femaleCount).toBe(1);
    });

    test('hydrated detail rows drive sex and health', () => {
        const s = summarizePastureAnimals([
            { gender: 'male', health: 55, __detailHydrated: true },
            { gender: 'female', health: 100, __detailHydrated: true },
        ]);
        expect(s.maleCount).toBe(1);
        expect(s.femaleCount).toBe(1);
        expect(s.avgHealthKnown).toBe(true);
        expect(s.avgHealth).toBe(78);
    });

    test('LOD synth rows do not become measured health', () => {
        const s = summarizePastureAnimals([
            { gender: 'female', health: 100, __lodSynth: true },
        ]);
        expect(s.avgHealthKnown).toBe(false);
        expect(s.femaleCount).toBe(1);
    });
});
