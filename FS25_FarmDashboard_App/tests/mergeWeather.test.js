// FS25 FarmDashboard | tests/mergeWeather.test.js
const { mergeWeather, mergeForecastDays, luaForecastIsLive } = require("../dataMerger.js");

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
    expect(merged.forecast[0].weatherType).toBe("sun");
  });

  test("temperature-only Lua does not wipe XML forecast days", () => {
    const xmlForecast = [
      { day: 1, weatherType: "RAIN", minTemperature: 8, maxTemperature: 12 },
      { day: 2, weatherType: "SUN", minTemperature: 10, maxTemperature: 16 },
    ];
    const merged = mergeWeather(
      { currentTemperature: 9.5 },
      { currentWeather: "CLOUDY", forecast: xmlForecast }
    );
    expect(luaForecastIsLive({ currentTemperature: 9.5 })).toBe(false);
    expect(merged.currentTemperature).toBe(9.5);
    expect(merged.currentWeather).toBe("cloudy");
    expect(merged.forecast).toHaveLength(2);
    expect(merged.forecast[0].weatherType).toBe("rain");
    expect(merged.forecast[1].maxTemperature).toBe(16);
  });

  test("temperature-only Lua keeps XML wind and does not invent unknown weather", () => {
    const merged = mergeWeather(
      { currentTemperature: 9.5 },
      { currentWeather: "CLOUDY", windSpeed: 4.2, cloudCoverage: 0.6, rainLevel: 0 }
    );
    expect(merged.currentTemperature).toBe(9.5);
    expect(merged.currentWeather).toBe("cloudy");
    expect(merged.windSpeed).toBe(4.2);
    expect(merged.cloudCoverage).toBe(0.6);
    expect(merged.rainLevel).toBe(0);
  });

  test("null Lua currentWeather does not replace XML type with unknown", () => {
    const merged = mergeWeather(
      { currentTemperature: 7, currentWeather: null },
      { currentWeather: "RAIN", windSpeed: 2 }
    );
    expect(merged.currentWeather).toBe("rain");
    expect(merged.currentTemperature).toBe(7);
    expect(merged.windSpeed).toBe(2);
  });

  test("empty Lua forecast array does not wipe XML forecast", () => {
    const merged = mergeWeather(
      { currentTemperature: 4, currentWeather: "unknown", forecast: [] },
      { currentWeather: "SUN", forecast: [{ day: 1, weatherType: "CLOUDY", minTemperature: 3, maxTemperature: 7 }] }
    );
    expect(merged.currentWeather).toBe("unknown");
    expect(merged.forecast[0].weatherType).toBe("cloudy");
    expect(merged.forecast[0].minTemperature).toBe(3);
  });

  test("null Lua weather keeps XML forecast", () => {
    const merged = mergeWeather(null, {
      currentWeather: "RAIN",
      currentTemperature: 6,
      forecast: [{ day: 1, weatherType: "SNOW", minTemperature: -1, maxTemperature: 2 }],
    });
    expect(merged.currentWeather).toBe("rain");
    expect(merged.forecast[0].weatherType).toBe("snow");
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

  test("stale Lua weather falls back to XML timeSinceLastRain", () => {
    const merged = mergeWeather(
      { snowLevel: 0 },
      { currentWeather: "RAIN", timeSinceLastRain: 42, snowLevel: 3 }
    );
    expect(merged.timeSinceLastRain).toBe(42);
    expect(merged.snowLevel).toBe(0);
  });

  test("live Lua weather does not fill timeSinceLastRain from XML", () => {
    const merged = mergeWeather(
      { currentWeather: "sun", currentTemperature: 18 },
      { timeSinceLastRain: 99 }
    );
    expect(merged.timeSinceLastRain).toBeUndefined();
  });
});
