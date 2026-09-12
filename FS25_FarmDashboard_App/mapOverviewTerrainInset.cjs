// FS25 FarmDashboard | mapOverviewTerrainInset.cjs
// Detect playable terrain inside PDA overview textures (desk border, compass, full-bleed, etc.).

const FULL_TERRAIN_INSET = { left: 0, top: 0, width: 1, height: 1 };

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function pixelAt(rgb, dim, x, y) {
  const i = (y * dim + x) * 3;
  return [rgb[i], rgb[i + 1], rgb[i + 2]];
}

/** Playable terrain tones — green fields, water, dry stubble (not PDA leather). */
function isMapishPixel(r, g, b) {
  // Lush / forest green
  if (g > 75 && g >= r * 0.85 && g - b > 10) return true;
  // Darker canopy
  if (g > 48 && g > r && g > b && g - b > 8 && r < 110) return true;
  // Water / ponds
  if (b > 90 && b > g && b > r && b - r > 18) return true;
  // Dry crop / stubble (tan-yellow) — exclude red-leading leather
  if (r > 95 && g > 85 && b < 95 && Math.abs(r - g) < 45 && r - b > 22 && g - b > 12 && r - g < 28) {
    return true;
  }
  return false;
}

/**
 * Empty padding / letterbox. Not the forested hills on the map rim.
 * Riverbend DDS corners are ~RGB 2,1,2.
 */
function isVoidPixel(r, g, b) {
  return Math.max(r, g, b) <= 12;
}

/**
 * PDA leather / wooden desk chrome only.
 * Dark forest (low RGB, green-leading) is terrain — never treat it as a frame.
 */
function isFramePixel(r, g, b) {
  if (isVoidPixel(r, g, b)) return false;
  // Tan / leather desk (red-leading brown, low blue)
  if (r >= 60 && g >= 28 && b <= 70 && r > g && g >= b && r - g >= 12) return true;
  if (r >= 50 && g >= 32 && b <= 40 && r > g) return true;
  // Warmer desk wood with a bit more blue still red-leading
  if (r >= 70 && g >= 35 && b <= 85 && r > g + 8 && r > b && r - b >= 20 && g - b < 35) return true;
  return false;
}

/** Leather desk or empty padding or studio/poster backdrop — UI around the aerial photograph. */
function isPosterBackdropPixel(r, g, b) {
  const max = Math.max(r, g, b);
  if (max < 90) return false;
  // Orange / red sunset (Montana 4X overview.dds is a splash poster)
  if (r > 130 && r - g > 35 && r - b > 50 && g < 120) return true;
  // Magenta / dusk sky
  if (b > 100 && r > 80 && g < 90 && b > g && r > g) return true;
  return false;
}

function isChromePixel(r, g, b) {
  return isVoidPixel(r, g, b) || isFramePixel(r, g, b) || isPosterBackdropPixel(r, g, b);
}

/**
 * Aerial photograph: fields, forest, water, snow, roofs, roads.
 * Excludes leather desk and empty padding. This is the any-map terrain square.
 */
function isTerrainContentPixel(r, g, b) {
  return !isChromePixel(r, g, b);
}

/**
 * What the outer ~3% of the texture is made of.
 * full-photograph: terrain (including dark hills) reaches the image edge — do not crop.
 * leather-frame: PDA desk around a satellite — crop to the photograph.
 * letterbox: empty padding around a square map — crop to the photograph.
 */
function classifyOverviewChrome(rgb, dim) {
  const band = Math.max(3, Math.floor(dim * 0.03));
  const step = dim >= 256 ? 2 : 1;
  let leather = 0;
  let voidPx = 0;
  let content = 0;
  let n = 0;

  function tally(x, y) {
    const [r, g, b] = pixelAt(rgb, dim, x, y);
    n += 1;
    if (isVoidPixel(r, g, b)) voidPx += 1;
    else if (isFramePixel(r, g, b) || isPosterBackdropPixel(r, g, b)) leather += 1;
    else content += 1;
  }

  for (let y = 0; y < band; y += 1) {
    for (let x = 0; x < dim; x += step) tally(x, y);
  }
  for (let y = dim - band; y < dim; y += 1) {
    for (let x = 0; x < dim; x += step) tally(x, y);
  }
  for (let y = band; y < dim - band; y += step) {
    for (let x = 0; x < band; x += 1) tally(x, y);
    for (let x = dim - band; x < dim; x += 1) tally(x, y);
  }

  const mix = {
    leather: n ? leather / n : 0,
    void: n ? voidPx / n : 0,
    content: n ? content / n : 0,
  };
  let kind = 'mixed';
  if (mix.leather >= 0.35) kind = 'leather-frame';
  else if (mix.content >= 0.45) kind = 'full-photograph';
  else if (mix.void >= 0.35) kind = 'letterbox';
  return { kind, ...mix };
}

/** Satellite field tones — primary signal for inner playable map (rejects brown desk). */
function scanSatelliteTerrainBounds(rgb, dim) {
  const rowThr = Math.max(10, Math.floor(dim * 0.035));
  const colThr = rowThr;
  const step = dim >= 256 ? 2 : 1;

  function rowCount(y) {
    let n = 0;
    for (let x = 0; x < dim; x += step) {
      const [r, g, b] = pixelAt(rgb, dim, x, y);
      if (isMapishPixel(r, g, b)) n += 1;
    }
    return n;
  }

  function colCount(x) {
    let n = 0;
    for (let y = 0; y < dim; y += step) {
      const [r, g, b] = pixelAt(rgb, dim, x, y);
      if (isMapishPixel(r, g, b)) n += 1;
    }
    return n;
  }

  const minRun = 3;
  let top = 0;
  let bottom = dim - 1;
  let left = 0;
  let right = dim - 1;

  let run = 0;
  for (let y = 0; y < dim; y += 1) {
    if (rowCount(y) >= rowThr) {
      run += 1;
      if (run >= minRun) {
        top = y - minRun + 1;
        break;
      }
    } else {
      run = 0;
    }
  }

  run = 0;
  for (let y = dim - 1; y >= 0; y -= 1) {
    if (rowCount(y) >= rowThr) {
      run += 1;
      if (run >= minRun) {
        bottom = y + minRun - 1;
        break;
      }
    } else {
      run = 0;
    }
  }

  run = 0;
  for (let x = 0; x < dim; x += 1) {
    if (colCount(x) >= colThr) {
      run += 1;
      if (run >= minRun) {
        left = x - minRun + 1;
        break;
      }
    } else {
      run = 0;
    }
  }

  run = 0;
  for (let x = dim - 1; x >= 0; x -= 1) {
    if (colCount(x) >= colThr) {
      run += 1;
      if (run >= minRun) {
        right = x + minRun - 1;
        break;
      }
    } else {
      run = 0;
    }
  }

  return insetFromBounds(left, top, right, bottom, dim);
}

function insetFromBounds(left, top, right, bottom, dim) {
  if (right <= left || bottom <= top) return null;
  return {
    left: clamp01(left / dim),
    top: clamp01(top / dim),
    width: clamp01((right - left + 1) / dim),
    height: clamp01((bottom - top + 1) / dim),
  };
}

/** Broader terrain mask — fallback when satellite scan misses (e.g. snow maps). */
function scanTerrainMaskBounds(rgb, dim) {
  const rowThr = Math.max(10, Math.floor(dim * 0.035));
  const colThr = rowThr;
  const step = dim >= 256 ? 2 : 1;

  function isTerrainPixel(r, g, b) {
    return isTerrainContentPixel(r, g, b);
  }

  function rowCount(y) {
    let n = 0;
    for (let x = 0; x < dim; x += step) {
      const [r, g, b] = pixelAt(rgb, dim, x, y);
      if (isTerrainPixel(r, g, b)) n += 1;
    }
    return n;
  }

  function colCount(x) {
    let n = 0;
    for (let y = 0; y < dim; y += step) {
      const [r, g, b] = pixelAt(rgb, dim, x, y);
      if (isTerrainPixel(r, g, b)) n += 1;
    }
    return n;
  }

  let top = 0;
  let bottom = dim - 1;
  let left = 0;
  let right = dim - 1;

  for (let y = 0; y < dim; y += 1) {
    if (rowCount(y) >= rowThr) {
      top = y;
      break;
    }
  }
  for (let y = dim - 1; y >= 0; y -= 1) {
    if (rowCount(y) >= rowThr) {
      bottom = y;
      break;
    }
  }
  for (let x = 0; x < dim; x += 1) {
    if (colCount(x) >= colThr) {
      left = x;
      break;
    }
  }
  for (let x = dim - 1; x >= 0; x -= 1) {
    if (colCount(x) >= colThr) {
      right = x;
      break;
    }
  }

  return insetFromBounds(left, top, right, bottom, dim);
}

function scanVarianceBounds(rgb, dim) {
  const step = dim >= 256 ? 2 : 1;
  const rowVars = new Array(dim).fill(0);
  const colVars = new Array(dim).fill(0);

  for (let y = 0; y < dim; y += 1) {
    let n = 0;
    let sum = 0;
    let sum2 = 0;
    for (let x = 0; x < dim; x += step) {
      const [r, g, b] = pixelAt(rgb, dim, x, y);
      const v = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += v;
      sum2 += v * v;
      n += 1;
    }
    rowVars[y] = n ? sum2 / n - (sum / n) ** 2 : 0;
  }

  for (let x = 0; x < dim; x += 1) {
    let n = 0;
    let sum = 0;
    let sum2 = 0;
    for (let y = 0; y < dim; y += step) {
      const [r, g, b] = pixelAt(rgb, dim, x, y);
      const v = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += v;
      sum2 += v * v;
      n += 1;
    }
    colVars[x] = n ? sum2 / n - (sum / n) ** 2 : 0;
  }

  const sortedRows = [...rowVars].sort((a, b) => a - b);
  const sortedCols = [...colVars].sort((a, b) => a - b);
  const rowThr = Math.max(90, sortedRows[Math.floor(dim * 0.45)] * 0.4);
  const colThr = Math.max(90, sortedCols[Math.floor(dim * 0.45)] * 0.4);

  let top = 0;
  let bottom = dim - 1;
  let left = 0;
  let right = dim - 1;

  for (let y = 0; y < dim; y += 1) {
    if (rowVars[y] >= rowThr) {
      top = y;
      break;
    }
  }
  for (let y = dim - 1; y >= 0; y -= 1) {
    if (rowVars[y] >= rowThr) {
      bottom = y;
      break;
    }
  }
  for (let x = 0; x < dim; x += 1) {
    if (colVars[x] >= colThr) {
      left = x;
      break;
    }
  }
  for (let x = dim - 1; x >= 0; x -= 1) {
    if (colVars[x] >= colThr) {
      right = x;
      break;
    }
  }

  return insetFromBounds(left, top, right, bottom, dim);
}

function scanFrameMarginBounds(rgb, dim) {
  const step = dim >= 256 ? 2 : 1;
  const rowFrame = new Array(dim).fill(0);
  const colFrame = new Array(dim).fill(0);

  for (let y = 0; y < dim; y += 1) {
    let f = 0;
    let n = 0;
    for (let x = 0; x < dim; x += step) {
      const [r, g, b] = pixelAt(rgb, dim, x, y);
      if (isChromePixel(r, g, b)) f += 1;
      n += 1;
    }
    rowFrame[y] = n ? f / n : 0;
  }

  for (let x = 0; x < dim; x += 1) {
    let f = 0;
    let n = 0;
    for (let y = 0; y < dim; y += step) {
      const [r, g, b] = pixelAt(rgb, dim, x, y);
      if (isChromePixel(r, g, b)) f += 1;
      n += 1;
    }
    colFrame[x] = n ? f / n : 0;
  }

  let top = 0;
  let bottom = dim - 1;
  let left = 0;
  let right = dim - 1;

  for (let y = 0; y < dim; y += 1) {
    if (rowFrame[y] < 0.55) {
      top = y;
      break;
    }
  }
  for (let y = dim - 1; y >= 0; y -= 1) {
    if (rowFrame[y] < 0.55) {
      bottom = y;
      break;
    }
  }
  for (let x = 0; x < dim; x += 1) {
    if (colFrame[x] < 0.55) {
      left = x;
      break;
    }
  }
  for (let x = dim - 1; x >= 0; x -= 1) {
    if (colFrame[x] < 0.55) {
      right = x;
      break;
    }
  }

  return insetFromBounds(left, top, right, bottom, dim);
}

function intersectInsets(a, b) {
  if (!a || !b) return null;
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function averageInsets(insets) {
  const valid = insets.filter(Boolean);
  if (!valid.length) return null;
  const sum = valid.reduce(
    (acc, inset) => ({
      left: acc.left + inset.left,
      top: acc.top + inset.top,
      width: acc.width + inset.width,
      height: acc.height + inset.height,
    }),
    { left: 0, top: 0, width: 0, height: 0 }
  );
  const n = valid.length;
  return {
    left: sum.left / n,
    top: sum.top / n,
    width: sum.width / n,
    height: sum.height / n,
  };
}

function insetArea(inset) {
  if (!inset) return 1;
  return Number(inset.width) * Number(inset.height);
}

function isUsableInset(inset) {
  return inset && inset.width >= 0.2 && inset.height >= 0.2 && insetArea(inset) < 0.92;
}

function scanLargestBlob(rgb, dim, pred) {
  if (!rgb || !dim || typeof pred !== 'function') return null;
  const seen = new Uint8Array(dim * dim);
  const stack = [];
  let best = null;

  for (let y = 0; y < dim; y += 1) {
    for (let x = 0; x < dim; x += 1) {
      const idx = y * dim + x;
      if (seen[idx]) continue;
      const pix = pixelAt(rgb, dim, x, y);
      if (!pred(pix[0], pix[1], pix[2])) {
        seen[idx] = 1;
        continue;
      }
      stack.length = 0;
      stack.push(x, y);
      seen[idx] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let n = 0;
      while (stack.length) {
        const cy = stack.pop();
        const cx = stack.pop();
        n += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const neigh = [cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1];
        for (let k = 0; k < 8; k += 2) {
          const nx = neigh[k];
          const ny = neigh[k + 1];
          if (nx < 0 || ny < 0 || nx >= dim || ny >= dim) continue;
          const ni = ny * dim + nx;
          if (seen[ni]) continue;
          const p = pixelAt(rgb, dim, nx, ny);
          if (!pred(p[0], p[1], p[2])) {
            seen[ni] = 1;
            continue;
          }
          seen[ni] = 1;
          stack.push(nx, ny);
        }
      }
      if (!best || n > best.n) best = { n, minX, maxX, minY, maxY };
    }
  }

  if (!best || best.n < Math.max(24, dim * dim * 0.04)) return null;
  return insetFromBounds(best.minX, best.minY, best.maxX, best.maxY, dim);
}

/**
 * Largest 4-connected mapish region. Promo overviews (Montana 4x poster) put extra
 * satellite thumbnails in a sidebar; row/col scans swallow those and crop too wide.
 */
function scanLargestMapishBlob(rgb, dim) {
  return scanLargestBlob(rgb, dim, isMapishPixel);
}

/** Largest connected aerial photograph (forest + fields + water), not field-green only. */
function scanLargestContentBlob(rgb, dim) {
  return scanLargestBlob(rgb, dim, isTerrainContentPixel);
}

function isUsableMapBlob(inset) {
  if (!isUsableInset(inset)) return false;
  const area = insetArea(inset);
  return area >= 0.12 && area <= 0.72;
}

/**
 * Playable terrain is square in world metres. Keep the min side; extra width/height
 * is PDA chrome or poster art. `start` = keep left/top (noise on the right/bottom);
 * `center` = split the extra when we do not know which edge is chrome.
 */
function squareizeTerrainInset(inset, align = "start") {
  if (!inset || isFullBleedInset(inset)) return inset;
  const left = Number(inset.left) || 0;
  const top = Number(inset.top) || 0;
  const width = Number(inset.width) || 0;
  const height = Number(inset.height) || 0;
  if (!(width > 0) || !(height > 0)) return inset;
  const aspect = width / height;
  if (aspect > 0.98 && aspect < 1.02) {
    const side = Math.min(width, height);
    return roundInset({ left, top, width: side, height: side });
  }
  const side = Math.min(width, height);
  if (width > height) {
    const extra = width - side;
    const dx = align === "center" ? extra / 2 : 0;
    return roundInset({ left: left + dx, top, width: side, height: side });
  }
  const extra = height - side;
  const dy = align === "center" ? extra / 2 : 0;
  return roundInset({ left, top: top + dy, width: side, height: side });
}

/** Prefer satellite bounds, tightened with desk/frame scan to ignore compass art. */
function pickRawTerrainInset(satellite, mask, variance, frame) {
  if (isUsableInset(satellite) && isUsableInset(frame)) {
    const merged = intersectInsets(satellite, frame);
    if (merged && merged.width >= 0.2 && merged.height >= 0.2) {
      return merged;
    }
  }

  if (isUsableInset(satellite)) return satellite;

  const fallbacks = [frame, mask, variance].filter(isUsableInset);
  if (!fallbacks.length) return { ...FULL_TERRAIN_INSET };

  fallbacks.sort((a, b) => insetArea(a) - insetArea(b));
  return fallbacks[0];
}

/**
 * Walk inward from each edge of a candidate inset while that edge is mostly PDA frame.
 * Fixes maps where green-field scan starts too early into the leather desk (e.g. Witcombe).
 */
function refineInsetTrimFrameEdges(rgb, dim, inset) {
  if (!inset || !rgb || !dim || isFullBleedInset(inset)) return inset;

  let left = Math.max(0, Math.min(1, Number(inset.left) || 0));
  let top = Math.max(0, Math.min(1, Number(inset.top) || 0));
  let width = Math.max(0, Math.min(1, Number(inset.width) || 1));
  let height = Math.max(0, Math.min(1, Number(inset.height) || 1));

  const thr = 0.42;
  const step = 1 / dim;
  const minSpan = 0.2;
  const maxSteps = Math.floor(dim * 0.28);

  function colFrameRatio(xFrac) {
    const x = Math.max(0, Math.min(dim - 1, Math.floor(xFrac * dim)));
    const y0 = Math.max(0, Math.floor(top * dim));
    const y1 = Math.min(dim, Math.ceil((top + height) * dim));
    let frame = 0;
    let n = 0;
    for (let y = y0; y < y1; y += 2) {
      const [r, g, b] = pixelAt(rgb, dim, x, y);
      if (isFramePixel(r, g, b)) frame += 1;
      n += 1;
    }
    return n ? frame / n : 0;
  }

  function rowFrameRatio(yFrac) {
    const y = Math.max(0, Math.min(dim - 1, Math.floor(yFrac * dim)));
    const x0 = Math.max(0, Math.floor(left * dim));
    const x1 = Math.min(dim, Math.ceil((left + width) * dim));
    let frame = 0;
    let n = 0;
    for (let x = x0; x < x1; x += 2) {
      const [r, g, b] = pixelAt(rgb, dim, x, y);
      if (isFramePixel(r, g, b)) frame += 1;
      n += 1;
    }
    return n ? frame / n : 0;
  }

  for (let i = 0; i < maxSteps && width > minSpan; i += 1) {
    if (colFrameRatio(left) < thr) break;
    left += step;
    width -= step;
  }
  for (let i = 0; i < maxSteps && width > minSpan; i += 1) {
    if (colFrameRatio(left + width - step) < thr) break;
    width -= step;
  }
  for (let i = 0; i < maxSteps && height > minSpan; i += 1) {
    if (rowFrameRatio(top) < thr) break;
    top += step;
    height -= step;
  }
  for (let i = 0; i < maxSteps && height > minSpan; i += 1) {
    if (rowFrameRatio(top + height - step) < thr) break;
    height -= step;
  }

  return {
    left: clamp01(left),
    top: clamp01(top),
    width: clamp01(width),
    height: clamp01(height),
  };
}

/** Total chrome margin around an inset (0–1). */
function insetMarginTotal(inset) {
  if (!inset) return 0;
  const left = Number(inset.left) || 0;
  const top = Number(inset.top) || 0;
  const width = Number(inset.width) || 1;
  const height = Number(inset.height) || 1;
  return left + top + Math.max(0, 1 - left - width) + Math.max(0, 1 - top - height);
}

/**
 * Extra left crop (fraction of full texture) for *visual clip only* (legacy UI).
 * Never feed this padded rect into applyOverviewCropPercent on a full PNG —
 * that shifts pins right relative to the satellite. Pin remapping uses rawInset.
 */
/** ~2% of full texture — enough to clear Witcombe left PDA chrome. */
const DISPLAY_LEFT_PAD = 0.02;

/** Clip inset — raw satellite rect plus a small left display tighten. */
function resolvePinTerrainInset(rawInset) {
  if (!rawInset || isFullBleedInset(rawInset)) return { ...FULL_TERRAIN_INSET };
  const w = Number(rawInset.width);
  const h = Number(rawInset.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 0.15 || h < 0.15) {
    return { ...FULL_TERRAIN_INSET };
  }
  let left = clamp01(Number(rawInset.left));
  const top = clamp01(Number(rawInset.top));
  let width = clamp01(w);
  const height = clamp01(h);

  // Left-only display pad (~0.8–1.5% of full texture); shrink width to match.
  const pad = Math.min(DISPLAY_LEFT_PAD, Math.max(0, width - 0.2));
  if (pad > 0) {
    left = clamp01(left + pad);
    width = clamp01(width - pad);
  }

  return { left, top, width, height };
}

function normalizeToSquareTerrainInset(inset) {
  return squareizeTerrainInset(resolvePinTerrainInset(inset), "center");
}

function isFullBleedInset(inset) {
  if (!inset) return true;
  const area = Number(inset.width) * Number(inset.height);
  return (
    area >= 0.94 &&
    Number(inset.left) <= 0.03 &&
    Number(inset.top) <= 0.03 &&
    Number(inset.left) + Number(inset.width) >= 0.97 &&
    Number(inset.top) + Number(inset.height) >= 0.97
  );
}

function measureInsetConfidence(inset, rgb, dim) {
  if (!inset || isFullBleedInset(inset)) return isFullBleedInset(inset) ? 0.92 : 0;

  let score = 0;
  const corners = [
    [2, 2],
    [dim - 3, 2],
    [2, dim - 3],
    [dim - 3, dim - 3],
  ];
  let frameCorners = 0;
  for (const [x, y] of corners) {
    const [r, g, b] = pixelAt(rgb, dim, x, y);
    if (isChromePixel(r, g, b)) frameCorners += 1;
  }
  score += (frameCorners / corners.length) * 0.25;

  const cx = Math.floor(dim * (inset.left + inset.width * 0.5));
  const cy = Math.floor(dim * (inset.top + inset.height * 0.5));
  const [cr, cg, cb] = pixelAt(rgb, dim, cx, cy);
  if (isMapishPixel(cr, cg, cb)) score += 0.2;

  const ar = Number(inset.width) / Number(inset.height);
  if (ar > 0.9 && ar < 1.1) score += 0.2;

  const area = Number(inset.width) * Number(inset.height);
  if (area < 0.9) score += 0.2;
  if (area < 0.75) score += 0.1;

  const border =
    Number(inset.left) +
    Number(inset.top) +
    (1 - Number(inset.left) - Number(inset.width)) +
    (1 - Number(inset.top) - Number(inset.height));
  if (border > 0.12) score += 0.15;

  return Math.min(1, score);
}

function roundInset(inset) {
  return {
    left: Math.round(Number(inset.left) * 10000) / 10000,
    top: Math.round(Number(inset.top) * 10000) / 10000,
    width: Math.round(Number(inset.width) * 10000) / 10000,
    height: Math.round(Number(inset.height) * 10000) / 10000,
  };
}

/**
 * Legacy single-pass scan (kept for tests).
 * @deprecated prefer analyzeOverviewTerrain
 */
function detectTerrainInsetFromRgb(rgb, size) {
  const analysis = analyzeOverviewTerrain(rgb, size);
  return analysis.rawInset;
}

/**
 * Full analysis: multi-heuristic detect → square terrain → crop/pin decision.
 * @returns {{ pinInset, rawInset, shouldCrop, confidence, mode, methods }}
 */
function analyzeOverviewTerrain(rgb, size) {
  const dim = Number(size);
  if (!rgb || !dim || dim < 8) {
    return {
      pinInset: { ...FULL_TERRAIN_INSET },
      rawInset: { ...FULL_TERRAIN_INSET },
      shouldCrop: false,
      confidence: 0,
      mode: 'unknown',
      methods: {},
    };
  }

  const chrome = classifyOverviewChrome(rgb, dim);
  const satellite = scanSatelliteTerrainBounds(rgb, dim);
  const content = scanTerrainMaskBounds(rgb, dim);
  const variance = scanVarianceBounds(rgb, dim);
  const frame = scanFrameMarginBounds(rgb, dim);
  const blob = scanLargestMapishBlob(rgb, dim);
  const contentBlob = scanLargestContentBlob(rgb, dim);

  function methodsOf(picked, rawInset) {
    return {
      chromeKind: chrome.kind,
      chromeMix: {
        leather: Math.round(chrome.leather * 1000) / 1000,
        void: Math.round(chrome.void * 1000) / 1000,
        content: Math.round(chrome.content * 1000) / 1000,
      },
      satellite: satellite ? roundInset(satellite) : null,
      content: content ? roundInset(content) : null,
      variance: variance ? roundInset(variance) : null,
      frame: frame ? roundInset(frame) : null,
      blob: blob ? roundInset(blob) : null,
      contentBlob: contentBlob ? roundInset(contentBlob) : null,
      picked: picked ? roundInset(picked) : null,
      refined: rawInset ? roundInset(rawInset) : null,
    };
  }

  // Photograph reaches the image edge (dark hills, water, snow). That IS the map.
  // Cropping it to field-green shifts overlays inland on every vanilla-style overview.
  if (chrome.kind === 'full-photograph') {
    return {
      pinInset: { ...FULL_TERRAIN_INSET },
      rawInset: { ...FULL_TERRAIN_INSET },
      shouldCrop: false,
      confidence: 0.95,
      mode: 'full-bleed',
      methods: methodsOf(content, content),
    };
  }

  const useContentBlob = isUsableMapBlob(contentBlob);
  const useMapishBlob = isUsableMapBlob(blob);
  let picked;
  let usedMapishBlob = false;
  if (useContentBlob && useMapishBlob) {
    const contentArea = insetArea(contentBlob);
    const mapishArea = insetArea(blob);
    // Poster art (sunset, credits) inflates the content blob; the satellite is mapish.
    if (contentArea > mapishArea * 1.4) {
      picked = blob;
      usedMapishBlob = true;
    } else {
      picked = contentBlob;
    }
  } else if (useContentBlob) {
    picked = contentBlob;
  } else if (useMapishBlob) {
    picked = blob;
    usedMapishBlob = true;
  } else if (
    (chrome.kind === 'leather-frame' || chrome.kind === 'letterbox') &&
    isUsableInset(content)
  ) {
    const merged = isUsableInset(frame) ? intersectInsets(content, frame) : null;
    picked = merged && merged.width >= 0.2 && merged.height >= 0.2 ? merged : content;
  } else {
    picked = pickRawTerrainInset(satellite, content, variance, frame);
  }

  const rawInset = refineInsetTrimFrameEdges(rgb, dim, picked) || picked;
  // Promo sidebar blobs keep the left/top of the largest satellite; framed photos center.
  const pinInset =
    usedMapishBlob
      ? squareizeTerrainInset(rawInset, 'start')
      : squareizeTerrainInset(rawInset, 'center');
  const confidence = measureInsetConfidence(pinInset, rgb, dim);
  const area = Number(pinInset.width) * Number(pinInset.height);

  // Mixed chrome with almost-full content: treat as the terrain square.
  // Do not use this escape for leather/letterbox — those still need a crop.
  if (area >= 0.82 && chrome.kind === 'mixed') {
    return {
      pinInset: { ...FULL_TERRAIN_INSET },
      rawInset: roundInset(rawInset),
      shouldCrop: false,
      confidence: Math.round(confidence * 1000) / 1000,
      mode: 'full-bleed',
      methods: methodsOf(picked, rawInset),
    };
  }

  let mode = 'full-bleed';
  if (!isFullBleedInset(pinInset)) {
    mode = Math.abs(pinInset.width - pinInset.height) < 0.02 ? 'framed-square' : 'framed-rect';
  }

  const shouldCrop = !isFullBleedInset(pinInset) && confidence >= 0.45 && area < 0.88;

  return {
    pinInset: roundInset(pinInset),
    rawInset: roundInset(rawInset),
    shouldCrop,
    confidence: Math.round(confidence * 1000) / 1000,
    mode,
    methods: methodsOf(picked, rawInset),
  };
}

/** @deprecated use analyzeOverviewTerrain().shouldCrop */
function shouldCropOverviewToTerrain(inset) {
  if (!inset || isFullBleedInset(inset)) return false;
  const area = Number(inset.width) * Number(inset.height);
  if (!Number.isFinite(area) || area >= 0.88) return false;
  const border =
    Number(inset.left) +
    Number(inset.top) +
    (1 - Number(inset.left) - Number(inset.width)) +
    (1 - Number(inset.top) - Number(inset.height));
  return border > 0.12;
}

module.exports = {
  FULL_TERRAIN_INSET,
  DISPLAY_LEFT_PAD,
  isMapishPixel,
  isFramePixel,
  isVoidPixel,
  isChromePixel,
  isPosterBackdropPixel,
  isTerrainContentPixel,
  classifyOverviewChrome,
  scanSatelliteTerrainBounds,
  scanLargestMapishBlob,
  scanLargestContentBlob,
  squareizeTerrainInset,
  detectTerrainInsetFromRgb,
  analyzeOverviewTerrain,
  resolvePinTerrainInset,
  refineInsetTrimFrameEdges,
  insetMarginTotal,
  normalizeToSquareTerrainInset,
  isFullBleedInset,
  shouldCropOverviewToTerrain,
  roundInset,
};
