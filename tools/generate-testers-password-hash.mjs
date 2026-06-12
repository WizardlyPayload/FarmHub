#!/usr/bin/env node
/**
 * Print SHA-256 hex for Website/js/testers-config.js → auth.passwordSha256
 *
 * Usage: node tools/generate-testers-password-hash.mjs "your-secret-password"
 */
import { createHash } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node tools/generate-testers-password-hash.mjs \"your-password\"");
  process.exit(1);
}

const hash = createHash("sha256").update(password, "utf8").digest("hex");
console.log(hash);
