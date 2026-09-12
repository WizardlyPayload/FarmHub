/**
 * Read-only probe of the GPortal profile tree, used to work out why
 * Soil Fertilizer reports no field data. Lists directories and prints small
 * text files only. Temporary diagnostic — safe to delete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SECRETS_PATH = path.join(REPO_ROOT, ".cursor", "secrets", "gportal-ftp.env");

function loadEnvFile(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = val;
  }
  return out;
}

const env = loadEnvFile(SECRETS_PATH);
const require = createRequire(path.join(REPO_ROOT, "FS25_FarmDashboard_App", "package.json"));
const ftp = require("basic-ftp");
const client = new ftp.Client(60_000);

const dirsToList = process.argv.slice(2).filter((a) => !a.startsWith("get:"));
const filesToGet = process.argv.slice(2).filter((a) => a.startsWith("get:")).map((a) => a.slice(4));

try {
  await client.access({
    host: env.GPORTAL_FTP_HOST,
    port: Number(env.GPORTAL_FTP_PORT || 21),
    user: env.GPORTAL_FTP_USER,
    password: env.GPORTAL_FTP_PASS,
    secure: false,
  });

  for (const dir of dirsToList) {
    try {
      const list = await client.list(dir);
      console.log(`\n=== ${dir} (${list.length}) ===`);
      for (const e of list) {
        console.log(`  [${e.isDirectory ? "dir " : "file"}] ${e.name}  ${e.size ?? ""}`);
      }
    } catch (err) {
      console.log(`\n=== ${dir} -> ERROR: ${err.message || err}`);
    }
  }

  for (const remote of filesToGet) {
    const local = path.join(REPO_ROOT, ".local-ftp-probe", path.basename(remote));
    fs.mkdirSync(path.dirname(local), { recursive: true });
    try {
      await client.downloadTo(local, remote);
      console.log(`\n=== downloaded ${remote} -> ${local} (${fs.statSync(local).size} bytes)`);
    } catch (err) {
      console.log(`\n=== ${remote} -> ERROR: ${err.message || err}`);
    }
  }
} finally {
  client.close();
}
