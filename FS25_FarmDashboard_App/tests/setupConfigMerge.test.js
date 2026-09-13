const {
  mergeServersPreserveSecrets,
  resolveServersForSave,
  configNeedsServerReboot,
  unionServersById,
} = require("../setupConfigMerge.cjs");

describe("setupConfigMerge", () => {
  test("keeps FTP password when the incoming row omits it", () => {
    const merged = mergeServersPreserveSecrets(
      [{ id: "a", mode: "ftp", ftpPass: "secret" }],
      [{ id: "a", mode: "ftp", ftpHost: "h", ftpPass: "" }]
    );
    expect(merged[0].ftpPass).toBe("secret");
    expect(merged[0].ftpHost).toBe("h");
  });

  test("refuses an empty servers list over a non-empty previous list", () => {
    const prev = [{ id: "a", name: "Riverbend", mode: "local" }];
    const out = resolveServersForSave(prev, []);
    expect(out.keptExisting).toBe(true);
    expect(out.servers).toEqual(prev);
  });

  test("allows the first save on a brand-new config", () => {
    const out = resolveServersForSave([], [{ id: "a", name: "New", mode: "local" }]);
    expect(out.keptExisting).toBe(false);
    expect(out.servers).toHaveLength(1);
  });

  test("configNeedsServerReboot is false when only unrelated keys change", () => {
    const servers = [{ id: "a", mode: "local", localSubFolder: "savegame1", name: "A" }];
    expect(
      configNeedsServerReboot(
        { servers, ftpPolling: { intervalMinutes: 5 }, isConfigured: true },
        { servers, ftpPolling: { intervalMinutes: 5 }, isConfigured: true, locale: "de" }
      )
    ).toBe(false);
  });

  test("configNeedsServerReboot is true when only an FTP password changes", () => {
    const base = {
      servers: [{ id: "a", mode: "ftp", ftpHost: "h", ftpUser: "u", ftpPass: "old" }],
    };
    expect(
      configNeedsServerReboot(base, {
        servers: [{ id: "a", mode: "ftp", ftpHost: "h", ftpUser: "u", ftpPass: "new" }],
      })
    ).toBe(true);
  });

  test("configNeedsServerReboot is true when a save is added", () => {
    expect(
      configNeedsServerReboot(
        { servers: [{ id: "a", mode: "local", localSubFolder: "savegame1" }] },
        {
          servers: [
            { id: "a", mode: "local", localSubFolder: "savegame1" },
            { id: "b", mode: "local", localSubFolder: "savegame2" },
          ],
        }
      )
    ).toBe(true);
  });

  test("unionServersById keeps local-only saves when syncing installed config", () => {
    const union = unionServersById(
      [{ id: "installed", name: "Installed" }],
      [{ id: "dev-only", name: "Added in NEW APP" }, { id: "installed", name: "Renamed locally" }]
    );
    expect(union.map((s) => s.id)).toEqual(["dev-only", "installed"]);
    expect(union.find((s) => s.id === "installed").name).toBe("Renamed locally");
  });
});
