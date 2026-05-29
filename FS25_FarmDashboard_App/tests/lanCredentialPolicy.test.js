// FS25 FarmDashboard | tests/lanCredentialPolicy.test.js | v3.9.0
//
// Locks down the LAN credential policy enforced by main.js when the user
// enables LAN access. The combination admin/farmhub used to be persisted
// without question (release blocker); these tests prove the new gate.

const {
  validateLanCredentials,
  MIN_PASSWORD_LENGTH,
  DEFAULT_USERNAME,
  DEFAULT_PASSWORD,
  KNOWN_WEAK_PASSWORDS,
} = require("../lanCredentialPolicy.js");

describe("validateLanCredentials: LAN access disabled", () => {
  test("never blocks the save when lanAccessEnabled === false", () => {
    expect(
      validateLanCredentials({
        lanAccessEnabled: false,
        lanUsername: "admin",
        lanPassword: "farmhub",
      })
    ).toEqual({ ok: true });
  });

  test("missing payload is treated as 'disabled' and accepted", () => {
    expect(validateLanCredentials(undefined)).toEqual({ ok: true });
    expect(validateLanCredentials(null)).toEqual({ ok: true });
    expect(validateLanCredentials({})).toEqual({ ok: true });
  });
});

describe("validateLanCredentials: LAN access enabled", () => {
  test("rejects the documented default pair (admin/farmhub)", () => {
    const res = validateLanCredentials({
      lanAccessEnabled: true,
      lanUsername: DEFAULT_USERNAME,
      lanPassword: DEFAULT_PASSWORD,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("default_credentials_rejected");
    expect(res.field).toBe("lanPassword");
  });

  test("rejects passwords shorter than the policy minimum", () => {
    const res = validateLanCredentials({
      lanAccessEnabled: true,
      lanUsername: "alice",
      lanPassword: "x".repeat(MIN_PASSWORD_LENGTH - 1),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("password_too_short");
  });

  test("rejects known-weak passwords even when above the length floor", () => {
    for (const weak of KNOWN_WEAK_PASSWORDS) {
      // Skip ones that are too short anyway — those fail at the length gate.
      if (weak.length < MIN_PASSWORD_LENGTH) continue;
      const res = validateLanCredentials({
        lanAccessEnabled: true,
        lanUsername: "alice",
        lanPassword: weak,
      });
      expect(res.ok).toBe(false);
      expect(["weak_password", "default_credentials_rejected"]).toContain(
        res.error
      );
    }
  });

  test("rejects empty/whitespace usernames", () => {
    const res = validateLanCredentials({
      lanAccessEnabled: true,
      lanUsername: "   ",
      lanPassword: "VeryStrongPassword!",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("username_required");
  });

  test("accepts a strong custom credential pair", () => {
    expect(
      validateLanCredentials({
        lanAccessEnabled: true,
        lanUsername: "farmer42",
        lanPassword: "Tractor!Sunset!Quad-9",
      })
    ).toEqual({ ok: true });
  });

  test("policy minimum is the documented value (10) — change with care", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
  });

  test("default credentials constants match historic values", () => {
    expect(DEFAULT_USERNAME).toBe("admin");
    expect(DEFAULT_PASSWORD).toBe("farmhub");
  });
});
