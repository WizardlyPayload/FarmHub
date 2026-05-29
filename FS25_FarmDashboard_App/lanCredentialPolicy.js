// FS25 FarmDashboard | lanCredentialPolicy.js | v3.9.0
//
// Centralised LAN credential policy. Used by main.js when saving LAN access
// settings and exercised by Jest unit tests so the default-credential and
// weak-password rules can't drift between code and tests.
//
// Policy (v3.9):
//   - When LAN access is OFF: any credentials are allowed (the server only
//     binds to loopback so they're never exposed).
//   - When LAN access is ON:
//       * lanUsername is required.
//       * lanPassword must be at least 10 chars.
//       * The default pair (admin/farmhub) is rejected outright.
//       * A small static list of common passwords is rejected.
//
// Why a separate module? Pre-release audit identified default credentials
// as a release blocker; centralising here lets us version, document, and
// test the rule set independently of Electron IPC plumbing.

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "farmhub";
const MIN_PASSWORD_LENGTH = 10;
const KNOWN_WEAK_PASSWORDS = new Set([
  "farmhub",
  "password",
  "password1",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty1234",
  "letmein123",
  "admin12345",
  "farmhub123",
  "welcome123",
  "changeme123",
]);

/**
 * Validate a LAN credential payload.
 *
 * @param {{
 *   lanAccessEnabled?: boolean;
 *   lanUsername?: string;
 *   lanPassword?: string;
 * }} payload
 * @returns {{ ok: true } | { ok: false, error: string, field?: string }}
 */
function validateLanCredentials(payload) {
  const enabled = !!(payload && payload.lanAccessEnabled);
  if (!enabled) return { ok: true };

  const username =
    payload && typeof payload.lanUsername === "string"
      ? payload.lanUsername.trim()
      : "";
  const password =
    payload && typeof payload.lanPassword === "string"
      ? payload.lanPassword
      : "";

  if (!username) {
    return { ok: false, error: "username_required", field: "lanUsername" };
  }
  if (
    username.toLowerCase() === DEFAULT_USERNAME &&
    password === DEFAULT_PASSWORD
  ) {
    return {
      ok: false,
      error: "default_credentials_rejected",
      field: "lanPassword",
    };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: "password_too_short", field: "lanPassword" };
  }
  if (KNOWN_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, error: "weak_password", field: "lanPassword" };
  }
  return { ok: true };
}

module.exports = {
  validateLanCredentials,
  MIN_PASSWORD_LENGTH,
  DEFAULT_USERNAME,
  DEFAULT_PASSWORD,
  KNOWN_WEAK_PASSWORDS,
};
