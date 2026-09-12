/**
 * Upload FS25_FarmDashboard.zip to GPortal dedicated FTP.
 * Credentials: .cursor/secrets/gportal-ftp.env (gitignored) — never commit.
 *
 * Usage (repo root):
 *   node tools/upload-gportal-mod.mjs           # upload the permanent release ZIP
 *   node tools/upload-gportal-mod.mjs --list    # list remote mods folder
 *   node tools/upload-gportal-mod.mjs --package # npm run package:mod then upload
 *
 * House rule: never leave incomplete uploads in the remote mods folder.
 * Upload stages to a temp name in the parent of mods/, then renames into place.
 * Any FarmDashboard .part / .tmp / .upload / .__uploading__ orphans in mods/ are deleted.
 *
 * Never prints password. Does not log full credentials.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SECRETS_PATH = path.join(REPO_ROOT, ".cursor", "secrets", "gportal-ftp.env");

const REMOTE_FINAL = "FS25_FarmDashboard.zip";
const STAGING_NAME = "FS25_FarmDashboard.zip.__uploading__";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing secrets file: ${filePath}`);
  }
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function defaultLocalZip() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const output = process.env.FARMDASH_BUILD_OUTPUT;
  const folder = output
    ? path.resolve(output)
    : path.join(home, "Documents", "FarmDash Release");
  return path.join(folder, REMOTE_FINAL);
}

function posixJoin(...parts) {
  return parts
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";
}

function parentDir(remoteMods) {
  const norm = remoteMods.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  const idx = norm.lastIndexOf("/");
  if (idx <= 0) return "/";
  return norm.slice(0, idx) || "/";
}

function isFarmDashboardOrphan(name) {
  if (!name || name === REMOTE_FINAL) return false;
  const lower = name.toLowerCase();
  if (!lower.includes("farmdashboard") && !lower.includes("farmdash")) return false;
  return (
    lower.endsWith(".part") ||
    lower.includes(".part.") ||
    /\.part\d*$/i.test(lower) ||
    lower.endsWith(".tmp") ||
    lower.endsWith(".upload") ||
    lower.endsWith(".__uploading__") ||
    lower.endsWith(".partial") ||
    lower.endsWith(".filepart") ||
    lower.endsWith("~")
  );
}

async function removeOrphans(client, remoteMods) {
  await client.cd(remoteMods);
  const list = await client.list();
  const orphans = list.filter((e) => !e.isDirectory && isFarmDashboardOrphan(e.name));
  for (const e of orphans) {
    console.log(`Removing orphan incomplete upload: ${remoteMods}/${e.name}`);
    await client.remove(e.name);
  }
  return orphans.map((e) => e.name);
}

async function removeIfExists(client, dir, name) {
  try {
    await client.cd(dir);
    const list = await client.list();
    if (list.some((e) => e.name === name)) {
      await client.remove(name);
    }
  } catch (err) {
    console.warn(`Cleanup warning (${dir}/${name}):`, err.message || err);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const listOnly = args.has("--list");
  const doPackage = args.has("--package");

  if (doPackage) {
    console.log("Running package:mod...");
    const r = spawnSync("npm", ["run", "package:mod"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
      shell: true,
    });
    if (r.status !== 0) process.exit(r.status || 1);
  }

  const env = loadEnvFile(SECRETS_PATH);
  const host = env.GPORTAL_FTP_HOST || "";
  const port = Number(env.GPORTAL_FTP_PORT || 21);
  const user = env.GPORTAL_FTP_USER || "";
  const pass = env.GPORTAL_FTP_PASS || "";
  const remoteMods = (env.GPORTAL_FTP_REMOTE_MODS || "/mods").replace(/\\/g, "/");
  const localZip = (env.GPORTAL_FTP_LOCAL_ZIP || "").trim() || defaultLocalZip();
  const stagingDir = parentDir(remoteMods);

  if (!host || !user || !pass) {
    throw new Error("GPORTAL_FTP_HOST / USER / PASS required in gportal-ftp.env");
  }
  if (!listOnly && !fs.existsSync(localZip)) {
    throw new Error(`Local zip not found: ${localZip} (run package:mod first)`);
  }

  const require = createRequire(
    path.join(REPO_ROOT, "FS25_FarmDashboard_App", "package.json")
  );
  const ftp = require("basic-ftp");
  const client = new ftp.Client(60_000);
  client.ftp.verbose = false;

  try {
    console.log(`Connecting ${host}:${port} as ${user}...`);
    await client.access({
      host,
      port,
      user,
      password: pass,
      secure: false,
    });

    console.log(`cwd -> ${remoteMods}`);
    await client.ensureDir(remoteMods);

    const removed = await removeOrphans(client, remoteMods);
    if (removed.length === 0) {
      console.log("No FarmDashboard incomplete part/tmp orphans in mods/");
    }

    if (listOnly) {
      await client.cd(remoteMods);
      const list = await client.list();
      console.log(`Remote ${remoteMods} (${list.length} entries):`);
      for (const e of list) {
        const kind = e.isDirectory ? "dir" : "file";
        console.log(`  [${kind}] ${e.name}  ${e.size ?? ""}`);
      }
      const fd = list.filter(
        (e) =>
          !e.isDirectory &&
          (e.name.toLowerCase().includes("farmdashboard") ||
            e.name.toLowerCase().includes("farmdash"))
      );
      console.log(
        `FarmDashboard-related files: ${fd.map((e) => e.name).join(", ") || "(none)"}`
      );
      return;
    }

    const bytes = fs.statSync(localZip).size;
    const stagingPath = posixJoin(stagingDir, STAGING_NAME);
    const finalPath = posixJoin(remoteMods, REMOTE_FINAL);

    console.log(
      `Staging ${path.basename(localZip)} (${bytes} bytes) -> ${stagingPath}`
    );
    await removeIfExists(client, stagingDir, STAGING_NAME);
    await client.cd(stagingDir);
    try {
      await client.uploadFrom(localZip, STAGING_NAME);
    } catch (err) {
      await removeIfExists(client, stagingDir, STAGING_NAME);
      await removeOrphans(client, remoteMods);
      throw err;
    }

    await removeIfExists(client, remoteMods, REMOTE_FINAL);
    console.log(`Promoting staging -> ${finalPath}`);
    try {
      await client.rename(stagingPath, finalPath);
    } catch (err) {
      // A running dedicated server keeps the zip open, so the delete above is
      // refused (451) and the rename then hits an existing file (550). Overwriting
      // in place could truncate a mod the server is reading, so stop instead.
      await removeIfExists(client, stagingDir, STAGING_NAME);
      const detail = String(err?.message || err);
      throw new Error(
        `${detail}\n` +
          `Could not replace ${finalPath} — the existing zip is locked.\n` +
          `Stop the dedicated server in the GPortal panel, then re-run this upload.\n` +
          `Nothing was changed on the server and the staging file was removed.`
      );
    }

    await removeOrphans(client, remoteMods);
    await removeIfExists(client, stagingDir, STAGING_NAME);

    await client.cd(remoteMods);
    const list = await client.list();
    const fd = list.filter(
      (e) =>
        !e.isDirectory &&
        (e.name.toLowerCase().includes("farmdashboard") ||
          e.name.toLowerCase().includes("farmdash"))
    );
    const onlyFinal =
      fd.length === 1 && fd[0].name === REMOTE_FINAL && Number(fd[0].size) > 0;
    console.log(
      "Remote FarmDashboard files: " +
        (fd.map((e) => e.name + "(" + e.size + ")").join(", ") || "(none)")
    );
    if (!onlyFinal) {
      throw new Error(
        "Post-upload check failed: expected only FS25_FarmDashboard.zip in mods/"
      );
    }
    console.log("Upload OK. Restart the dedicated server (and client) to load the new mod.");
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error("GPortal FTP upload failed:", err.message || err);
  process.exit(1);
});
