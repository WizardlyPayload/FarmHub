// FS25 FarmDashboard | tests/setup.validation.test.js | v3.9.0
//
// Coverage for the v3.9 setup hardening:
//  - mapSaveError(): maps low-level errors to actionable copy by class.
//  - findMissingFtpFields(): drives per-field validation marking.
//  - setup.html structural wiring: invalid-feedback elements present,
//    success card present, validation CSS present, helpers exposed.

const fs = require("fs");
const path = require("path");
const {
  mapSaveError,
  findMissingFtpFields,
} = require("../web/assests/js/setup-validation.js");

function readSetupHtml() {
  return fs.readFileSync(path.join(__dirname, "..", "setup.html"), "utf8");
}

describe("mapSaveError: error-class -> actionable copy", () => {
  test("network errors -> network copy", () => {
    const out = mapSaveError("connect ETIMEDOUT 10.0.0.5:21");
    expect(out).toMatch(/Server unreachable/i);
  });

  test("ECONNREFUSED -> network copy", () => {
    expect(mapSaveError("ECONNREFUSED")).toMatch(/Server unreachable/i);
  });

  test("auth errors -> auth copy", () => {
    expect(mapSaveError("530 Authentication failed")).toMatch(
      /rejected by the server/i
    );
    expect(mapSaveError("401 Unauthorized")).toMatch(/rejected by the server/i);
  });

  test("path errors -> path copy", () => {
    expect(mapSaveError("ENOENT: no such file or directory")).toMatch(
      /Save folder not found/i
    );
    expect(mapSaveError("Path not found: savegame1")).toMatch(
      /Save folder not found/i
    );
  });

  test("token errors -> token copy", () => {
    expect(mapSaveError("Invalid setup token")).toMatch(/token expired/i);
  });

  test("unknown errors fall through to generic copy with original msg", () => {
    expect(mapSaveError("disk full")).toMatch(/Could not save/i);
    expect(mapSaveError("disk full")).toMatch(/disk full/);
  });

  test("respects custom st() translator", () => {
    const st = (key, params, fallback) => {
      if (key === "setup.errAuth") return "AUTH_OVERRIDE";
      return fallback || key;
    };
    expect(mapSaveError("Forbidden", st)).toBe("AUTH_OVERRIDE");
  });
});

describe("findMissingFtpFields", () => {
  test("flags every empty FTP field", () => {
    expect(findMissingFtpFields({})).toEqual(["ftpHost", "ftpUser", "ftpPass"]);
    expect(findMissingFtpFields(null)).toEqual([
      "ftpHost",
      "ftpUser",
      "ftpPass",
    ]);
  });

  test("returns only the empty fields when others are filled", () => {
    expect(
      findMissingFtpFields({
        ftpHost: "ftp.example.com",
        ftpUser: "",
        ftpPass: "",
      })
    ).toEqual(["ftpUser", "ftpPass"]);
  });

  test("returns empty when all fields are filled", () => {
    expect(
      findMissingFtpFields({ ftpHost: "h", ftpUser: "u", ftpPass: "p" })
    ).toEqual([]);
  });
});

describe("setup.html: per-field validation wiring", () => {
  const html = readSetupHtml();

  test("invalid-feedback element exists for serverName", () => {
    expect(html).toMatch(/id="serverName-error"/);
    expect(html).toMatch(/data-field="serverName"/);
  });

  test("invalid-feedback elements exist for FTP fields", () => {
    expect(html).toMatch(/id="ftpHost-error"/);
    expect(html).toMatch(/id="ftpUser-error"/);
    expect(html).toMatch(/id="ftpPass-error"/);
  });

  test("validation CSS present (is-invalid class)", () => {
    expect(html).toMatch(/input\.is-invalid\s*\{/);
    expect(html).toMatch(/\.invalid-feedback\s*\{/);
  });

  test("setup-success-card element present and styled", () => {
    expect(html).toMatch(/id="setupSuccessCard"/);
    expect(html).toMatch(/\.setup-success-card\s*\{/);
    expect(html).toMatch(/setup-success-card\.show/);
  });

  test("addServer marks every missing FTP field, not just first", () => {
    expect(html).toMatch(/missing\.forEach\(markFieldInvalid\)/);
  });

  test("saveAndLaunch routes errors through mapSaveError", () => {
    expect(html).toMatch(/toast\(mapSaveError\(msg\)/);
  });

  test("success card is shown before redirect", () => {
    expect(html).toMatch(/showSuccessCard\(\)/);
    expect(html).toMatch(
      /window\.location\.href\s*=\s*['"]\/['"]/
    );
  });

  test("validation helpers exposed for debugging hooks", () => {
    expect(html).toMatch(/__farmdashSetupValidation/);
  });

  test("setup-validation.js is loaded by setup.html", () => {
    expect(html).toMatch(/setup-validation\.js/);
  });
});

describe("setup.html: i18n keys for new copy exist", () => {
  const en = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "web/locales/messages/en.json"),
      "utf8"
    )
  );
  const REQUIRED = [
    "setup.errDisplayNameRequired",
    "setup.errFtpHostRequired",
    "setup.errFtpUserRequired",
    "setup.errFtpPassRequired",
    "setup.errNetwork",
    "setup.errAuth",
    "setup.errPath",
    "setup.errToken",
    "setup.successSaved",
  ];
  test.each(REQUIRED)("messages/en.json has key %s", (key) => {
    expect(typeof en[key]).toBe("string");
    expect(en[key].length).toBeGreaterThan(0);
  });
});
