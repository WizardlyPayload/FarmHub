"use strict";

/** Animal Food Overview page: feed table lists always arrays; mixture ingredient arrays kept aligned. */

function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeMixture(mix) {
    if (!mix || typeof mix !== "object") return null;
    const weights = Array.isArray(mix.ingredientWeights) ? mix.ingredientWeights : [];
    const foods = Array.isArray(mix.ingredientFoods) ? mix.ingredientFoods : [];
    const n = Math.min(weights.length, foods.length);
    const ingredients = [];
    for (let i = 0; i < n; i += 1) {
        const weight = finite(weights[i]);
        if (weight !== undefined && typeof foods[i] === "string") ingredients.push({ weightPercent: weight, foods: foods[i] });
    }
    return { title: typeof mix.title === "string" ? mix.title : "", ingredients };
}

module.exports = {
    key: "animalFoodOverview",
    arrays: [
        "animals",
        "recipes",
        "animals.*.groups",
        "animals.*.groups.*.foods",
        "animals.*.mixtures",
        "animals.*.mixtures.*.ingredientWeights",
        "animals.*.mixtures.*.ingredientFoods",
        "recipes.*.ingredients",
    ],
    normalize(page) {
        page.animals = page.animals
            .filter((a) => a && typeof a === "object")
            .map((a) => ({
                ...a,
                consumption: a.consumption === "sequential" ? "sequential" : "parallel",
                mixtures: a.mixtures.map(normalizeMixture).filter(Boolean),
            }));
        page.recipes = page.recipes.filter((r) => r && typeof r === "object" && typeof r.title === "string");
        page.animalTypeCount = page.animals.length;
        return page;
    },
};
