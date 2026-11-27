import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXPECTED_SHA256 = '2575753cd23fee5aa3e587b703a58afd54687d4a99a6e3c767a6cd3aac44feee';

export function inspectBundledMapExtractor(projectDir) {
  const root = path.join(projectDir, 'resources', 'map-overview-extract');
  const exe = path.join(root, 'farmdash-map-overview-extract.exe');
  const license = path.join(root, 'GAR-LIB-LICENSE.txt');
  const provenance = path.join(root, 'PROVENANCE.md');
  const config = path.join(projectDir, 'electron-builder.rf.yml');
  if (![exe, license, provenance, config].every((file) => fs.existsSync(file))) {
    return { ok: false, reason: 'DLC map reader binary, attribution or V5 packaging config is missing' };
  }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
  if (actual !== EXPECTED_SHA256) {
    return { ok: false, reason: `DLC map reader hash mismatch: ${actual}` };
  }
  const yml = fs.readFileSync(config, 'utf8');
  if (!/from:\s*resources\/map-overview-extract\s*\r?\n\s*to:\s*map-overview-extract/.test(yml)) {
    return { ok: false, reason: 'V5 installer does not include the DLC map reader' };
  }
  return { ok: true, sha256: actual };
}
