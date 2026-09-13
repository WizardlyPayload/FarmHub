/**
 * WP-07: engine current weather, not Weather Guard / invented bands.
 * Run: node --experimental-strip-types --test tests/weatherNormalize.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  engineWeatherChip,
  formatForecastTempRange,
  normalizeWeatherCondition,
} from "../../NEW APP/src/lib/weather.ts";

test("snow and cloudy stay distinct; greedy cloud substrings are unknown", () => {
  assert.equal(normalizeWeatherCondition("snow"), "snow");
  assert.equal(normalizeWeatherCondition("SNOW"), "snow");
  assert.equal(normalizeWeatherCondition("cloudy"), "cloudy");
  assert.equal(normalizeWeatherCondition("partially cloudy"), "cloudy");
  assert.equal(normalizeWeatherCondition("snowClouds"), "unknown");
  assert.equal(normalizeWeatherCondition(""), "unknown");
  assert.equal(normalizeWeatherCondition("twister"), "unknown");
});

test("forecast range does not invent a ±5 band from current temperature", () => {
  assert.equal(formatForecastTempRange({}, 16), "—");
  assert.equal(formatForecastTempRange({ minTemperature: 4, maxTemperature: 9 }), "4° - 9°C");
  assert.equal(formatForecastTempRange({ minTemperature: 4 }), "4°C");
});

test("Weather Guard sky does not replace engine current weather", () => {
  const weather = { currentTemperature: 16, currentWeather: "snow" };
  const chip = engineWeatherChip(weather);
  assert.equal(chip.show, true);
  assert.equal(chip.condition, "snow");
  assert.equal(chip.temperature, 16);
  assert.equal(engineWeatherChip(weather).condition, "snow");
});

test("farm id is not an input to the current-weather chip", () => {
  const chip = engineWeatherChip({ currentWeather: "rain", currentTemperature: 8 });
  assert.equal(chip.condition, "rainy");
  assert.equal("farmId" in chip, false);
});
