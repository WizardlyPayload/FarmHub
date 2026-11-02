const fs = require("fs");
const os = require("os");
const path = require("path");

test("installed HUD archive search includes profile DLC and game-root dataS.gar", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fd-hud-archive-paths-"));
  const game = path.join(root, "game");
  const profile = path.join(root, "profile");
  const profileDlc = path.join(profile, "pdlc", "beansAndAlpacasPack.dlc");
  const dataS = path.join(game, "dataS.gar");
  fs.mkdirSync(path.dirname(profileDlc), { recursive: true });
  fs.mkdirSync(game, { recursive: true });
  fs.writeFileSync(profileDlc, "test");
  fs.writeFileSync(dataS, "test");
  try {
    jest.isolateModules(() => {
      jest.doMock("../mapOverviewResolver", () => ({ getFs25GameInstallRoots: () => [game] }));
      jest.doMock("../fs25Paths", () => ({ collectFs25DocumentRoots: () => [profile] }));
      const { installedHudArchives } = require("../fillTypeHud.cjs");
      expect(installedHudArchives()).toEqual(expect.arrayContaining([dataS, profileDlc]));
    });
  } finally {
    jest.dontMock("../mapOverviewResolver");
    jest.dontMock("../fs25Paths");
    fs.rmSync(root, { recursive: true, force: true });
  }
});
