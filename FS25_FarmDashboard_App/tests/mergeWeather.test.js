// FS25 FarmDashboard | tests/mergeWeather.test.js
const { mergeWeather, mergeForecastDays } = require("../dataMerger.js");

describe("mergeForecastDays", () => {
  test("keeps Lua temperatures and Lua types when XML forecast has null temps", () => {
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
    expect(out[0].weatherType).toBe("sun");
    expect(out[0].precipitationChance).toBe(20);
  });

  test("does not synthesize forecast temps when both sources lack values", () => {
    const out = mergeForecastDays([], [{ day: 2, weatherType: "SUN" }], 12);
    expect(out[0].minTemperature).toBeUndefined();
    expect(out[0].maxTemperature).toBeUndefined();
    expect(out[0].weatherType).toBe("sun");
  });

  test("live Lua forecast is not overwritten by XML types", () => {
    const lua = [{ day: 1, weatherType: "snow", minTemperature: -2, maxTemperature: 1 }];
    const xml = [{ day: 1, weatherType: "CLOUDY", minTemperature: null, maxTemperature: null }];
    const out = mergeForecastDays(lua, xml, 16, true);
    expect(out).toHaveLength(1);
    expect(out[0].weatherType).toBe("snow");
    expect(out[0].minTemperature).toBe(-2);
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
    expect(merged.forecast[0].weatherType).toBe("sun");
    expect(merged.currentWeather).toBe("rain");
  });

  test("live Lua snow is not replaced by stale XML cloudy", () => {
    const merged = mergeWeather(
      { currentTemperature: 16, currentWeather: "snow" },
      { currentWeather: "CLOUDY", forecast: [{ weatherType: "SUN" }] }
    );
    expect(merged.currentWeather).toBe("snow");
    expect(merged.currentTemperature).toBe(16);
    expect(merged.forecast).toEqual([]);
  });

  test("live Lua unknown is not filled from XML sun", () => {
    const merged = mergeWeather(
      { currentTemperature: 4, currentWeather: "unknown" },
      { currentWeather: "SUN" }
    );
    expect(merged.currentWeather).toBe("unknown");
  });

  test("empty Lua weather falls back to XML current type", () => {
    const merged = mergeWeather({}, { currentWeather: "CLOUDY", currentTemperature: 11 });
    expect(merged.currentWeather).toBe("cloudy");
    expect(merged.currentTemperature).toBe(11);
  });
});
