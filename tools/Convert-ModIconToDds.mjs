#!/usr/bin/env node
/**
 * Build FS25 mod icon DDS from icon.png on the official ModHub template:
 * - icon_modName.dds naming (icon_FarmDashboard.dds)
 * - 512×512 pixels (FS25 TestRunner + ModHub forum spec)
 * - DXT1 / BC1 compression, no mipmaps
 * - Official modIcon_BG512.png template background (Giants ModHub)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const appRoot = path.join(repoRoot, 'FS25_FarmDashboard_App');
const require = createRequire(path.join(appRoot, 'package.json'));
const { PNG } = require('pngjs');
const dxt = require('dxt-js');

const MOD_ICON_NAME = 'icon_FarmDashboard.dds';
const ICON_SIZE = 512;
const LOGO_SCALE = 0.62;
const modDir = path.join(repoRoot, 'FS25_FarmDashboard_Mod');
const pngPath = path.join(modDir, 'icon.png');
const templatePath = path.join(repoRoot, 'tools', 'modIcon_BG512.png');
const generatedTemplatePath = path.join(repoRoot, 'tools', 'modIcon_BG512.generated.png');
const ddsPath = path.join(modDir, MOD_ICON_NAME);

function isValidPng(filePath) {
  try {
    const head = fs.readFileSync(filePath).subarray(0, 8);
    return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  } catch {
    return false;
  }
}

/** Approximate FS25 ModHub icon background when Giants CDN is unavailable. */
function buildModHubTemplate512() {
  const png = new PNG({ width: ICON_SIZE, height: ICON_SIZE });
  for (let y = 0; y < ICON_SIZE; y += 1) {
    for (let x = 0; x < ICON_SIZE; x += 1) {
      const nx = x / ICON_SIZE;
      const ny = y / ICON_SIZE;
      const diag = nx * 0.85 + ny * 0.55;
      const band = Math.max(0, 1 - Math.abs(diag - 0.72) / 0.18);
      const baseR = 62 + nx * 18;
      const baseG = 108 + ny * 22;
      const baseB = 38 + nx * 8;
      const hiR = 168 + band * 40;
      const hiG = 198 + band * 30;
      const hiB = 52 + band * 20;
      const mix = Math.min(1, band * 1.15);
      const di = (ICON_SIZE * y + x) << 2;
      png.data[di] = Math.round(baseR * (1 - mix) + hiR * mix);
      png.data[di + 1] = Math.round(baseG * (1 - mix) + hiG * mix);
      png.data[di + 2] = Math.round(baseB * (1 - mix) + hiB * mix);
      png.data[di + 3] = 255;
    }
  }
  return png;
}

function resolveTemplatePng() {
  if (isValidPng(templatePath)) return PNG.sync.read(fs.readFileSync(templatePath));
  if (isValidPng(generatedTemplatePath)) return PNG.sync.read(fs.readFileSync(generatedTemplatePath));
  const built = buildModHubTemplate512();
  fs.writeFileSync(generatedTemplatePath, PNG.sync.write(built));
  console.warn('Using generated ModHub-style template:', generatedTemplatePath);
  return built;
}

function findTexconv() {
  const candidates = [
    path.join(repoRoot, 'tools', 'texconv', 'texconv.exe'),
    path.join(appRoot, 'resources', 'texconv', 'texconv.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const out = spawnSync('where.exe', ['texconv'], { encoding: 'utf8', windowsHide: true });
    const line = out.stdout?.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (line && fs.existsSync(line)) return line;
  } catch {
    /* ignore */
  }
  return null;
}

function isLogoBackground(r, g, b, a) {
  if (a < 20) return true;
  return r < 48 && g < 48 && b < 55;
}

/** Composite logo onto ModHub template; returns RGBA buffer ICON_SIZE×ICON_SIZE. */
function buildCompositeRgba(template, logo) {
  const out = Buffer.from(template.data);
  const drawW = Math.max(1, Math.round(ICON_SIZE * LOGO_SCALE));
  const drawH = Math.max(1, Math.round((logo.height / logo.width) * drawW));
  const offX = Math.floor((ICON_SIZE - drawW) / 2);
  const offY = Math.floor((ICON_SIZE - drawH) / 2);

  for (let y = 0; y < drawH; y += 1) {
    for (let x = 0; x < drawW; x += 1) {
      const srcX = Math.min(logo.width - 1, Math.floor((x / drawW) * logo.width));
      const srcY = Math.min(logo.height - 1, Math.floor((y / drawH) * logo.height));
      const si = (logo.width * srcY + srcX) << 2;
      const r = logo.data[si];
      const g = logo.data[si + 1];
      const b = logo.data[si + 2];
      const a = logo.data[si + 3];
      if (isLogoBackground(r, g, b, a)) continue;

      const dx = offX + x;
      const dy = offY + y;
      if (dx < 0 || dy < 0 || dx >= ICON_SIZE || dy >= ICON_SIZE) continue;
      const di = (ICON_SIZE * dy + dx) << 2;
      const alpha = a / 255;
      out[di] = Math.round(r * alpha + out[di] * (1 - alpha));
      out[di + 1] = Math.round(g * alpha + out[di + 1] * (1 - alpha));
      out[di + 2] = Math.round(b * alpha + out[di + 2] * (1 - alpha));
      out[di + 3] = 255;
    }
  }
  return out;
}

function resizeTemplate(template) {
  if (template.width === ICON_SIZE && template.height === ICON_SIZE) return template;
  const out = new PNG({ width: ICON_SIZE, height: ICON_SIZE });
  const sx = template.width / ICON_SIZE;
  const sy = template.height / ICON_SIZE;
  for (let y = 0; y < ICON_SIZE; y += 1) {
    for (let x = 0; x < ICON_SIZE; x += 1) {
      const srcX = Math.min(template.width - 1, Math.floor(x * sx));
      const srcY = Math.min(template.height - 1, Math.floor(y * sy));
      const si = (template.width * srcY + srcX) << 2;
      const di = (ICON_SIZE * y + x) << 2;
      out.data[di] = template.data[si];
      out.data[di + 1] = template.data[si + 1];
      out.data[di + 2] = template.data[si + 2];
      out.data[di + 3] = template.data[si + 3];
    }
  }
  return out;
}

function writeDxt1Dds(compressed, width, height) {
  const out = Buffer.alloc(128 + compressed.length);
  out.write('DDS ', 0);
  out.writeUInt32LE(124, 4);
  out.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x1000 | 0x80000, 8);
  out.writeUInt32LE(height, 12);
  out.writeUInt32LE(width, 16);
  out.writeUInt32LE(compressed.length, 20);
  out.writeUInt32LE(0, 24);
  out.writeUInt32LE(1, 28);
  out.writeUInt32LE(32, 76);
  out.writeUInt32LE(0x4, 80);
  out.write('DXT1', 84);
  out.writeUInt32LE(0x1000, 108);
  Buffer.from(compressed).copy(out, 128);
  return out;
}

if (!fs.existsSync(pngPath)) {
  console.error('Missing icon.png:', pngPath);
  process.exit(1);
}

const logo = PNG.sync.read(fs.readFileSync(pngPath));
let template = resolveTemplatePng();
template = resizeTemplate(template);
const rgba = buildCompositeRgba(template, logo);

const texconv = findTexconv();
if (texconv) {
  const tmp = path.join(modDir, '_icon_dds_work');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const sizedPng = path.join(tmp, 'icon_512.png');
  const outPng = new PNG({ width: ICON_SIZE, height: ICON_SIZE });
  rgba.copy(outPng.data);
  fs.writeFileSync(sizedPng, PNG.sync.write(outPng));
  const r = spawnSync(
    texconv,
    ['-nologo', '-y', '-f', 'BC1_UNORM', '-m', '1', '-o', tmp, sizedPng],
    { windowsHide: true }
  );
  const built = path.join(tmp, 'icon_512.dds');
  if (r.status === 0 && fs.existsSync(built)) {
    fs.copyFileSync(built, ddsPath);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('Wrote DXT1 ModHub-template icon via texconv:', ddsPath);
    process.exit(0);
  }
  console.warn('texconv failed; falling back to dxt-js');
  fs.rmSync(tmp, { recursive: true, force: true });
}

const flags = dxt.flags.DXT1 | dxt.flags.ColourClusterFit;
const compressed = dxt.compress(rgba, ICON_SIZE, ICON_SIZE, flags);
fs.writeFileSync(ddsPath, writeDxt1Dds(compressed, ICON_SIZE, ICON_SIZE));

for (const legacy of ['icon.dds']) {
  const legacyPath = path.join(modDir, legacy);
  if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
}

console.log('Wrote DXT1', MOD_ICON_NAME, `(${ICON_SIZE}x${ICON_SIZE}, ModHub template)`);
