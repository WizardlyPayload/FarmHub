// FS25 FarmDashboard | tests/mergeWeather.test.js
const { mergeWeather, mergeForecastDays } = require("../dataMerger.js");

describe("mergeForecastDays", () => {
  test("keeps Lua temperatures when XML forecast has null temps", () => {
    const lua = [
      {
        day: 1,
        weatherType: "sun",
        minTemperature: 16,
        maxTemperature: 26,
        precipitationChance: 20,
      },
    ];
    const xml = [
      {
        day: 42,
        weatherType: "RAIN",
        minTemperature: null,
        maxTemperature: null,
        precipitationChance: 80,
      },
    ];
    const out = mergeForecastDays(lua, xml, 18);
    expect(out[0].minTemperature).toBe(16);
    expect(out[0].maxTemperature).toBe(26);
    expect(out[0].weatherType).toBe("rain");
    expect(out[0].precipitationChance).toBe(20);
  });

  test("synthesizes forecast temps from current temperature when both lack values", () => {
    const out = mergeForecastDays([], [{ day: 2, weatherType: "SUN" }], 12);
    expect(out[0].minTemperature).toBeGreaterThan(0);
    expect(out[0].maxTemperature).toBeGreaterThan(out[0].minTemperature);
    expect(out[0].weatherType).toBe("sun");
  });
});

describe("mergeWeather", () => {
  test("does not replace Lua forecast with null-temp XML forecast", () => {
    const merged = mergeWeather(
      {
        currentTemperature: 9.5,
        currentWeather: "rain",
        forecast: [
          {
            day: 1,
            weatherType: "sun",
            minTemperature: 14,
            maxTemperature: 22,
          },
        ],
      },
      {
        currentWeather: "SUN",
        forecast: [{ day: 10, weatherType: "RAIN", minTemperature: null, maxTemperature: null }],
      }
    );
    expect(merged.currentTemperature).toBe(9.5);
    expect(merged.forecast[0].minTemperature).toBe(14);
    expect(merged.forecast[0].maxTemperature).toBe(22);
    expect(merged.currentWeather).toBe("rain");
  });
});
