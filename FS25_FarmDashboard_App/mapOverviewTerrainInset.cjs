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

/** Satellite / field tones (green-forward, not brown desk). */
function isMapishPixel(r, g, b) {
  return g > 75 && g >= r * 0.85 && g - b > 10;
}

/** PDA desk, compass backing, dark vignette — not playable terrain. */
function isFramePixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 40) return true;
  // Tan / leather desk (red-leading brown, low blue)
  if (r >= 60 && g >= 28 && b <= 70 && r > g && g >= b && r - g >= 12) return true;
  if (r >= 50 && g >= 32 && b <= 40 && r >= g) return true;
  return false;
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
    if (isFramePixel(r, g, b)) return false;
    if (isMapishPixel(r, g, b)) return true;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max > 0 ? (max - min) / max : 0;
    return sat > 0.12 || max > 50;
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
      if (isFramePixel(r, g, b)) f += 1;
      n += 1;
    }
    rowFrame[y] = n ? f / n : 0;
  }

  for (let x = 0; x < dim; x += 1) {
    let f = 0;
    let n = 0;
    for (let y = 0; y < dim; y += step) {
      const [r, g, b] = pixelAt(rgb, dim, x, y);
      if (isFramePixel(r, g, b)) f += 1;
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

/** Pin/crop inset — keep full detected rectangle so map edges are not clipped. */
function resolvePinTerrainInset(rawInset) {
  if (!rawInset || isFullBleedInset(rawInset)) return { ...FULL_TERRAIN_INSET };
  const w = Number(rawInset.width);
  const h = Number(rawInset.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 0.15 || h < 0.15) {
    return { ...FULL_TERRAIN_INSET };
  }
  return {
    left: clamp01(Number(rawInset.left)),
    top: clamp01(Number(rawInset.top)),
    width: clamp01(w),
    height: clamp01(h),
  };
}

/** @deprecated square squeeze clips map edges on rectangular PDA frames */
function normalizeToSquareTerrainInset(inset) {
  return resolvePinTerrainInset(inset);
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
    if (isFramePixel(r, g, b)) frameCorners += 1;
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

  const satellite = scanSatelliteTerrainBounds(rgb, dim);
  const mask = scanTerrainMaskBounds(rgb, dim);
  const variance = scanVarianceBounds(rgb, dim);
  const frame = scanFrameMarginBounds(rgb, dim);
  const rawInset = pickRawTerrainInset(satellite, mask, variance, frame);
  const pinInset = resolvePinTerrainInset(rawInset);
  const confidence = measureInsetConfidence(pinInset, rgb, dim);

  let mode = 'full-bleed';
  if (!isFullBleedInset(pinInset)) {
    mode = Math.abs(pinInset.width - pinInset.height) < 0.02 ? 'framed-square' : 'framed-rect';
  }

  const shouldCrop =
    !isFullBleedInset(pinInset) &&
    confidence >= 0.45 &&
    pinInset.width * pinInset.height < 0.88;

  return {
    pinInset: roundInset(pinInset),
    rawInset: roundInset(rawInset),
    shouldCrop,
    confidence: Math.round(confidence * 1000) / 1000,
    mode,
    methods: {
      satellite: satellite ? roundInset(satellite) : null,
      mask: mask ? roundInset(mask) : null,
      variance: variance ? roundInset(variance) : null,
      frame: frame ? roundInset(frame) : null,
    },
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
  isMapishPixel,
  isFramePixel,
  scanSatelliteTerrainBounds,
  detectTerrainInsetFromRgb,
  analyzeOverviewTerrain,
  resolvePinTerrainInset,
  normalizeToSquareTerrainInset,
  isFullBleedInset,
  shouldCropOverviewToTerrain,
  roundInset,
};
