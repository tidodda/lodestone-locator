const rowsEl = document.getElementById('rows');
const addRowBtn = document.getElementById('addRow');
const estimateBtn = document.getElementById('estimate');
const resultPanel = document.getElementById('resultPanel');
const spriteModal = document.getElementById('spriteModal');
const compassImg = document.getElementById('compassImg');
const compassLabel = document.getElementById('compassLabel');
const closeModalBtn = document.getElementById('closeModal');

let rows = [];
let nextId = 0;
let modalTargetRowId = null;
let modalSprite = 0;

function spritePath(i) {
  return 'compass_textures/compass_' + String(i).padStart(2, '0') + '.png';
}

function addRow(x, z, sprite) {
  const id = nextId++;
  rows.push({ id, x: x !== undefined ? x : '', z: z !== undefined ? z : '', sprite: sprite !== undefined ? sprite : 0 });
  renderRows();
}

function renderRows() {
  rowsEl.innerHTML = '';
  rows.forEach(row => {
    const div = document.createElement('div');
    div.className = 'row';
    div.dataset.id = row.id;
    div.innerHTML =
      '<div class="coord"><label>X</label><input type="number" class="in-x" value="' + row.x + '"></div>' +
      '<div class="coord"><label>Z</label><input type="number" class="in-z" value="' + row.z + '"></div>' +
      '<div class="sprite-picker">' +
        '<img src="' + spritePath(row.sprite) + '">' +
        '<span>#' + String(row.sprite).padStart(2, '0') + '</span>' +
      '</div>' +
      '<button class="remove-row" title="Remove">&times;</button>';
    rowsEl.appendChild(div);
  });
}

rowsEl.addEventListener('input', e => {
  const rowDiv = e.target.closest('.row');
  const id = parseInt(rowDiv.dataset.id);
  const row = rows.find(r => r.id === id);
  if (e.target.classList.contains('in-x')) row.x = e.target.value;
  if (e.target.classList.contains('in-z')) row.z = e.target.value;
});

rowsEl.addEventListener('click', e => {
  const rowDiv = e.target.closest('.row');
  if (!rowDiv) return;
  const id = parseInt(rowDiv.dataset.id);

  if (e.target.closest('.remove-row')) {
    rows = rows.filter(r => r.id !== id);
    renderRows();
    return;
  }

  if (e.target.closest('.sprite-picker')) {
    openSpriteModal(id);
  }
});

function renderCompass() {
  compassImg.src = spritePath(modalSprite);
  compassLabel.textContent = '#' + String(modalSprite).padStart(2, '0');
}

function openSpriteModal(rowId) {
  modalTargetRowId = rowId;
  const row = rows.find(r => r.id === rowId);
  modalSprite = row ? row.sprite : 0;
  renderCompass();
  spriteModal.classList.add('open');
}

function closeSpriteModal() {
  spriteModal.classList.remove('open');
  modalTargetRowId = null;
}

function advanceCompass() {
  const row = rows.find(r => r.id === modalTargetRowId);
  if (row) row.sprite = modalSprite;
  renderRows();

  const idx = rows.findIndex(r => r.id === modalTargetRowId);
  const next = rows[idx + 1];
  if (next) {
    openSpriteModal(next.id);
  } else {
    closeSpriteModal();
  }
}

closeModalBtn.addEventListener('click', () => {
  closeSpriteModal();
});

document.addEventListener('mousemove', e => {
  if (!spriteModal.classList.contains('open')) return;
  const rect = compassImg.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = e.clientX - cx;
  const dz = e.clientY - cy;
  if (Math.hypot(dx, dz) < 4) return;
  const angle = Math.atan2(dz, dx);
  let sprite = Math.round(angle * 32 / (2 * Math.PI) - 17.5 + 8);
  sprite = ((sprite % 32) + 32) % 32;
  if (sprite !== modalSprite) {
    modalSprite = sprite;
    renderCompass();
  }
});

document.addEventListener('keydown', e => {
  if (!spriteModal.classList.contains('open')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    advanceCompass();
  }
});

addRowBtn.addEventListener('click', () => addRow());

addRow(0, 0, 0);
addRow(100, 0, 16);
addRow(0, 100, 24);

function wrap(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function solvePosition(ls, angles, weights) {
  let Sxx = 0, Sxy = 0, Syy = 0, Sxc = 0, Syc = 0;
  ls.forEach((r, i) => {
    const w = weights ? weights[i] : 1;
    const a = Math.sin(angles[i]) * w;
    const b = -Math.cos(angles[i]) * w;
    const c = a * r.x + b * r.z;
    Sxx += a * a; Sxy += a * b; Syy += b * b;
    Sxc += a * c; Syc += b * c;
  });
  const det = Sxx * Syy - Sxy * Sxy;
  if (Math.abs(det) < 1e-9) return null;
  return {
    x: (Sxc * Syy - Syc * Sxy) / det,
    z: (Sxx * Syc - Sxy * Sxc) / det
  };
}

function weightedSolve(ls, angles, iters) {
  let pos = solvePosition(ls, angles);
  if (!pos) return null;
  for (let it = 0; it < (iters || 3); it++) {
    const weights = ls.map(r => 1 / (Math.hypot(r.x - pos.x, r.z - pos.z) + 1));
    const next = solvePosition(ls, angles, weights);
    if (!next) break;
    pos = next;
  }
  return pos;
}

function geometricMedian(points, iters) {
  let x = points.reduce((s, p) => s + p.x, 0) / points.length;
  let z = points.reduce((s, p) => s + p.z, 0) / points.length;
  for (let it = 0; it < iters; it++) {
    let wsum = 0, xs = 0, zs = 0;
    points.forEach(p => {
      const d = Math.hypot(p.x - x, p.z - z) + 1e-6;
      const w = 1 / d;
      wsum += w; xs += w * p.x; zs += w * p.z;
    });
    if (wsum === 0) break;
    x = xs / wsum; z = zs / wsum;
  }
  return { x, z };
}

function ensembleSolve(ls, angles, numSubsets) {
  if (ls.length < 4) {
    const pos = weightedSolve(ls, angles);
    return pos ? { ...pos, spread50: 0, spread90: 0, estimates: [pos] } : null;
  }

  const subsetSize = Math.min(6, ls.length - 1);
  const estimates = [];
  for (let s = 0; s < numSubsets; s++) {
    const idx = [...Array(ls.length).keys()];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const chosen = idx.slice(0, subsetSize);
    const subLs = chosen.map(i => ls[i]);
    const subAngles = chosen.map(i => angles[i]);
    const pos = weightedSolve(subLs, subAngles);
    if (pos) estimates.push(pos);
  }
  if (estimates.length === 0) {
    const pos = weightedSolve(ls, angles);
    return pos ? { ...pos, spread50: 0, spread90: 0, estimates: [pos] } : null;
  }
  const med = geometricMedian(estimates, 40);
  const distances = estimates.map(p => Math.hypot(p.x - med.x, p.z - med.z)).sort((a, b) => a - b);
  const spread50 = distances[Math.floor(distances.length * 0.5)];
  const spread90 = distances[Math.floor(distances.length * 0.9)];
  return { ...med, spread50, spread90, estimates };
}

function residualsDeg(ls, angles, pos) {
  return ls.map((r, i) => {
    const predicted = Math.atan2(r.z - pos.z, r.x - pos.x);
    return Math.abs(wrap(predicted - angles[i]) * 180 / Math.PI);
  });
}

function solveLeastSquares(ls, angles, halfRes) {
  const numSubsets = 300;
  let sol = ensembleSolve(ls, angles, numSubsets);
  if (!sol) return null;

  const resid = residualsDeg(ls, angles, sol);
  const sorted = [...resid].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mad = [...resid].map(v => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)] || 1;
  const outlierIdx = [];
  resid.forEach((v, i) => {
    if (v > median + Math.max(6 * mad, 15) && ls.length - outlierIdx.length > 3) outlierIdx.push(i);
  });

  let finalSol = sol;
  if (outlierIdx.length > 0) {
    const keep = ls.map((_, i) => i).filter(i => !outlierIdx.includes(i));
    const refit = ensembleSolve(keep.map(i => ls[i]), keep.map(i => angles[i]), numSubsets);
    if (refit) finalSol = refit;
  }

  let nearest = Infinity;
  ls.forEach(r => {
    const dist = Math.hypot(r.x - finalSol.x, r.z - finalSol.z);
    if (dist < nearest) nearest = dist;
  });
  const baseline = nearest * halfRes;

  return {
    pos: { x: finalSol.x, z: finalSol.z },
    uncertainty: Math.max(baseline, finalSol.spread90 || 0),
    spread50: Math.max(baseline, finalSol.spread50 || 0),
    excluded: outlierIdx,
    method: 'weighted least-squares (ensemble)'
  };
}

function clipHalfplane(poly, nx, nz, ax, az) {
  if (poly.length === 0) return poly;
  const val = p => nx * (p.x - ax) + nz * (p.z - az);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], nxt = poly[(i + 1) % poly.length];
    const vc = val(cur), vn = val(nxt);
    if (vc >= 0) out.push(cur);
    if ((vc >= 0) !== (vn >= 0)) {
      const t = vc / (vc - vn);
      out.push({ x: cur.x + t * (nxt.x - cur.x), z: cur.z + t * (nxt.z - cur.z) });
    }
  }
  return out;
}
function wedgeIntersection(ls, angles, halfRes, box) {
  let poly = [
    { x: box.minX, z: box.minZ }, { x: box.maxX, z: box.minZ },
    { x: box.maxX, z: box.maxZ }, { x: box.minX, z: box.maxZ }
  ];
  for (let i = 0; i < ls.length; i++) {
    const r = ls[i], center = angles[i];
    const start = center - halfRes, end = center + halfRes;
    const n1x = -Math.sin(start), n1z = Math.cos(start);
    const n2x = Math.sin(end), n2z = -Math.cos(end);
    poly = clipHalfplane(poly, n1x, n1z, r.x, r.z);
    if (poly.length === 0) return null;
    poly = clipHalfplane(poly, n2x, n2z, r.x, r.z);
    if (poly.length === 0) return null;
  }
  return poly;
}
function polygonCentroid(poly) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const cross = p.x * q.z - q.x * p.z;
    a += cross; cx += (p.x + q.x) * cross; cz += (p.z + q.z) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-6) {
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
      z: poly.reduce((s, p) => s + p.z, 0) / poly.length
    };
  }
  return { x: cx / (6 * a), z: cz / (6 * a) };
}
function maxVertexDist(poly, c) {
  let m = 0;
  poly.forEach(p => { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d > m) m = d; });
  return m;
}
function combos(n, k) {
  const res = [];
  (function rec(start, chosen) {
    if (chosen.length === k) { res.push([...chosen]); return; }
    for (let i = start; i < n; i++) { chosen.push(i); rec(i + 1, chosen); chosen.pop(); }
  })(0, []);
  return res;
}
function wedgeSolve(ls, angles, halfRes, maxExclude) {
  const xs = ls.map(r => r.x), zs = ls.map(r => r.z);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 10000);
  const pad = span * 20;
  const box = {
    minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad,
    minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad
  };
  function scoreCandidate(excl) {
    const keep = ls.map((_, i) => i).filter(i => !excl.includes(i));
    const subLs = keep.map(i => ls[i]);
    const subAngles = keep.map(i => angles[i]);
    const poly = wedgeIntersection(subLs, subAngles, halfRes, box);
    if (!poly) return null;
    const c = polygonCentroid(poly);
    const residuals = ls.map((r, i) => Math.abs(wrap(Math.atan2(c.z - r.z, c.x - r.x) - angles[i]) * 180 / Math.PI));
    const worst = Math.max(...residuals);
    return { pos: c, poly, uncertainty: maxVertexDist(poly, c), excluded: excl, fitScore: worst };
  }
  let overallBest = null;
  for (let k = 0; k <= maxExclude; k++) {
    if (ls.length - k < 3) break;
    let bestForK = null;
    combos(ls.length, k).forEach(excl => {
      const cand = scoreCandidate(excl);
      if (cand && (!bestForK || cand.fitScore < bestForK.fitScore)) bestForK = cand;
    });
    if (!bestForK) continue;
    if (!overallBest || bestForK.fitScore < overallBest.fitScore - 2) overallBest = bestForK;
    else break;
  }
  return overallBest;
}

function pointInPolygon(poly, p) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    const intersect = ((zi > p.z) !== (zj > p.z)) &&
      (p.x < (xj - xi) * (p.z - zi) / (zj - zi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function estimate() {
  const valid = rows
    .map(r => ({ x: parseFloat(r.x), z: parseFloat(r.z), sprite: r.sprite }))
    .filter(r => Number.isFinite(r.x) && Number.isFinite(r.z));

  if (valid.length < 2) {
    alert('Add at least 2 lodestones with coordinates.');
    return;
  }

  const angles = valid.map(r => ((r.sprite + 17.5) / 32) * 2 * Math.PI);
  const halfRes = (2 * Math.PI / 32) / 2;

  let candidateA = null;
  if (valid.length >= 3) {
    const maxExclude = Math.min(2, valid.length - 3);
    const w = wedgeSolve(valid, angles, halfRes, maxExclude);
    if (w) candidateA = { pos: w.pos, poly: w.poly, uncertainty: w.uncertainty, excluded: w.excluded, method: 'exact intersection' };
  }

  const candidateB = solveLeastSquares(valid, angles, halfRes);

  if (!candidateA && !candidateB) {
    alert('Lodestone readings are too close to parallel to solve. Use lodestones spread further apart.');
    return;
  }

  const chosen = candidateA || candidateB;
  const disagreement = (candidateA && candidateB && !pointInPolygon(candidateA.poly, candidateB.pos));

  const usedIdx = valid.map((_, i) => i).filter(i => !chosen.excluded.includes(i));
  const usedValid = usedIdx.map(i => valid[i]);
  const usedAngles = usedIdx.map(i => angles[i]);
  const px = chosen.pos.x, pz = chosen.pos.z;

  let sumSqDeg = 0;
  usedValid.forEach((r, i) => {
    const predicted = Math.atan2(r.z - pz, r.x - px);
    const diff = wrap(predicted - usedAngles[i]);
    sumSqDeg += (diff * 180 / Math.PI) ** 2;
  });
  const rmsDeg = Math.sqrt(sumSqDeg / usedValid.length);
  const uncertainty = Math.round(chosen.uncertainty);
  const uncertainty50 = chosen.spread50 !== undefined ? Math.round(chosen.spread50) : null;

  let maxSpreadDeg = 0;
  for (let i = 0; i < usedAngles.length; i++) {
    for (let j = i + 1; j < usedAngles.length; j++) {
      const d = Math.abs(wrap(usedAngles[i] - usedAngles[j]) * 180 / Math.PI);
      if (d > maxSpreadDeg) maxSpreadDeg = d;
    }
  }

  const warnEl = document.getElementById('outWarning');
  const warnings = [];
  if (chosen.excluded.length > 0) {
    warnings.push('Ignored ' + chosen.excluded.length + ' reading(s) that didn\'t fit the rest (rows: ' +
      chosen.excluded.map(i => i + 1).join(', ') + '). Check those coordinates/sprites.');
  }
  if (maxSpreadDeg < 25) {
    warnings.push('Lodestone bearings are close to parallel — accuracy is low. Add lodestones from more spread-out directions.');
  }
  if (disagreement) {
    warnings.push('The two solving methods landed in different spots - that usually means a bad reading or wrong sprite somewhere. Double check your entries.');
  }
  warnEl.style.display = warnings.length ? 'block' : 'none';
  warnEl.textContent = warnings.join(' ');

  document.getElementById('outX').textContent = px.toFixed(1);
  document.getElementById('outZ').textContent = pz.toFixed(1);
  document.getElementById('outUncertainty').textContent = uncertainty50 !== null && uncertainty50 !== uncertainty
    ? '±' + uncertainty50.toLocaleString() + ' typical, ±' + uncertainty.toLocaleString() + ' worst-case'
    : '±' + uncertainty.toLocaleString();
  document.getElementById('outResidual').textContent = rmsDeg.toFixed(2) + '°';
  document.getElementById('outMethod').textContent = chosen.method;
  resultPanel.style.display = 'block';
}

estimateBtn.addEventListener('click', estimate);

document.getElementById('loadJson').addEventListener('click', () => {
  const raw = document.getElementById('jsonInput').value.trim();
  if (!raw) return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    alert('Could not parse that JSON.');
    return;
  }
  if (!Array.isArray(data)) {
    alert('JSON should be an array of { x, z, sprite } objects.');
    return;
  }
  rows = [];
  data.forEach(item => {
    addRow(item.x, item.z, item.sprite || 0);
  });
});

const copyJsonBtn = document.getElementById('copyJson');
copyJsonBtn.addEventListener('click', () => {
  const data = rows.map(r => ({
    x: r.x === '' ? null : parseFloat(r.x),
    z: r.z === '' ? null : parseFloat(r.z),
    sprite: r.sprite
  }));
  const text = JSON.stringify(data, null, 2);
  document.getElementById('jsonInput').value = text;
  navigator.clipboard.writeText(text).catch(() => {});
  const original = copyJsonBtn.textContent;
  copyJsonBtn.textContent = 'Copied';
  setTimeout(() => { copyJsonBtn.textContent = original; }, 1200);
});

// ============================================================
// Import sprite readings from an inventory screenshot.
// Reads a grid of compass icons, matches each against the 32
// reference sprites in compass_textures/, and writes the result
// straight into `sprite` on each row (creating rows as needed).
// ============================================================

const REF_SIZE = 32;
let importRefCanvases = null; // ImageData[] at REF_SIZE, lazy-loaded once
let importSrcCanvas = null;
let importSrcImage = null;

function loadImageAsync(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasImageData(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
}

// Lanczos-3 resize — much closer to a proper downsample/upsample than the
// browser's default canvas scaling, which matters a lot when matching
// against 16x16 source textures.
function lanczosKernel(x, a) {
  if (x === 0) return 1;
  if (x <= -a || x >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}
function lanczosResize(srcData, srcW, srcH, dstW, dstH) {
  const a = 3;
  const tmp = new Float64Array(srcH * dstW * 4);
  const scaleX = srcW / dstW, filterScaleX = Math.max(1, scaleX), supportX = a * filterScaleX;
  for (let dx = 0; dx < dstW; dx++) {
    const srcX = (dx + 0.5) * scaleX - 0.5;
    const left = Math.floor(srcX - supportX), right = Math.ceil(srcX + supportX);
    const weights = []; let wsum = 0;
    for (let sx = left; sx <= right; sx++) {
      const w = lanczosKernel((sx - srcX) / filterScaleX, a);
      if (w !== 0) { weights.push([sx, w]); wsum += w; }
    }
    for (let sy = 0; sy < srcH; sy++) {
      let r = 0, g = 0, b = 0, al = 0;
      for (const [sx, w] of weights) {
        const cx = Math.min(srcW - 1, Math.max(0, sx));
        const idx = (sy * srcW + cx) * 4;
        r += srcData[idx] * w; g += srcData[idx + 1] * w; b += srcData[idx + 2] * w; al += srcData[idx + 3] * w;
      }
      const o = (sy * dstW + dx) * 4;
      tmp[o] = r / wsum; tmp[o + 1] = g / wsum; tmp[o + 2] = b / wsum; tmp[o + 3] = al / wsum;
    }
  }
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const scaleY = srcH / dstH, filterScaleY = Math.max(1, scaleY), supportY = a * filterScaleY;
  for (let dy = 0; dy < dstH; dy++) {
    const srcY = (dy + 0.5) * scaleY - 0.5;
    const top = Math.floor(srcY - supportY), bottom = Math.ceil(srcY + supportY);
    const weights = []; let wsum = 0;
    for (let sy = top; sy <= bottom; sy++) {
      const w = lanczosKernel((sy - srcY) / filterScaleY, a);
      if (w !== 0) { weights.push([sy, w]); wsum += w; }
    }
    for (let dx = 0; dx < dstW; dx++) {
      let r = 0, g = 0, b = 0, al = 0;
      for (const [sy, w] of weights) {
        const cy = Math.min(srcH - 1, Math.max(0, sy));
        const idx = (cy * dstW + dx) * 4;
        r += tmp[idx] * w; g += tmp[idx + 1] * w; b += tmp[idx + 2] * w; al += tmp[idx + 3] * w;
      }
      const o = (dy * dstW + dx) * 4;
      out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum; out[o + 3] = al / wsum;
    }
  }
  return new ImageData(out, dstW, dstH);
}

async function buildImportRefCanvases() {
  const out = [];
  for (let i = 0; i < 32; i++) {
    const img = await loadImageAsync(spritePath(i));
    const raw = document.createElement('canvas');
    raw.width = img.width; raw.height = img.height;
    raw.getContext('2d').drawImage(img, 0, 0);
    const rawData = canvasImageData(raw);
    out.push(lanczosResize(rawData.data, img.width, img.height, REF_SIZE, REF_SIZE));
  }
  return out;
}

// ---- grid-line detection: fit evenly-spaced lines to the darkest columns/rows ----
function grayColumnProfile(imgData, w, h) {
  const { data } = imgData;
  const y0 = Math.floor(h * 0.1), y1 = Math.floor(h * 0.9);
  const profile = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y++) { const idx = (y * w + x) * 4; sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3; n++; }
    profile[x] = sum / n;
  }
  return profile;
}
function grayRowProfile(imgData, w, h) {
  const { data } = imgData;
  const x0 = Math.floor(w * 0.1), x1 = Math.floor(w * 0.9);
  const profile = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0, n = 0;
    for (let x = x0; x < x1; x++) { const idx = (y * w + x) * 4; sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3; n++; }
    profile[y] = sum / n;
  }
  return profile;
}
function findGridLines(profile, expectedCount) {
  const n = profile.length;
  let best = null;
  const minSpacing = n / (expectedCount + 3), maxSpacing = n / expectedCount;
  for (let spacing = minSpacing; spacing < maxSpacing; spacing += 0.1) {
    const maxOffset = n - spacing * expectedCount;
    if (maxOffset <= 0) continue;
    for (let offset = 0; offset < maxOffset; offset += 0.5) {
      let score = 0, ok = true;
      for (let i = 0; i <= expectedCount; i++) {
        const pos = Math.round(offset + i * spacing);
        if (pos >= n) { ok = false; break; }
        score += profile[pos];
      }
      if (!ok) continue;
      if (best === null || score < best.score) best = { score, offset, spacing };
    }
  }
  if (!best) throw new Error('Could not fit a grid to this image.');
  const bounds = [];
  for (let i = 0; i <= expectedCount; i++) bounds.push(Math.round(best.offset + i * best.spacing));
  return bounds.map(b => {
    const lo = Math.max(0, b - 2), hi = Math.min(n, b + 3);
    let bestX = lo, bestV = Infinity;
    for (let x = lo; x < hi; x++) if (profile[x] < bestV) { bestV = profile[x]; bestX = x; }
    return bestX;
  });
}
function importAutoGrid(imgData, w, h, cols, rows_) {
  return {
    colBounds: findGridLines(grayColumnProfile(imgData, w, h), cols),
    rowBounds: findGridLines(grayRowProfile(imgData, w, h), rows_),
  };
}

function importCropCell(srcCanvas, x0, y0, x1, y1, inset) {
  const w = (x1 - x0) - inset * 2, h = (y1 - y0) - inset * 2;
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  c.getContext('2d').drawImage(srcCanvas, x0 + inset, y0 + inset, w, h, 0, 0, w, h);
  return c;
}

function importMatchCell(cellCanvas, refs) {
  const raw = canvasImageData(cellCanvas);
  const cellData = lanczosResize(raw.data, cellCanvas.width, cellCanvas.height, REF_SIZE, REF_SIZE);
  const d = cellData.data;
  const corners = [0, (REF_SIZE - 1) * 4, ((REF_SIZE - 1) * REF_SIZE) * 4, ((REF_SIZE - 1) * REF_SIZE + (REF_SIZE - 1)) * 4];
  let bg = [0, 0, 0];
  for (const off of corners) { bg[0] += d[off]; bg[1] += d[off + 1]; bg[2] += d[off + 2]; }
  bg = bg.map(v => v / 4);
  let bestIdx = -1, bestScore = Infinity;
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i].data;
    let score = 0;
    for (let p = 0; p < d.length; p += 4) {
      const a = r[p + 3] / 255;
      for (let ch = 0; ch < 3; ch++) {
        const comp = r[p + ch] * a + bg[ch] * (1 - a);
        const diff = comp - d[p + ch];
        score += diff * diff;
      }
    }
    if (score < bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestIdx;
}

function importMode(arr) {
  const counts = new Map();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  let bestV = arr[0], bestC = 0;
  for (const [v, c] of counts) if (c > bestC) { bestC = c; bestV = v; }
  return { value: bestV, confidence: bestC / arr.length };
}

async function readCompassesFromImage(sourceCanvas, cols, rows_) {
  const w = sourceCanvas.width, h = sourceCanvas.height;
  const imgData = canvasImageData(sourceCanvas);
  const { colBounds, rowBounds } = importAutoGrid(imgData, w, h, cols, rows_);

  if (!importRefCanvases) importRefCanvases = await buildImportRefCanvases();

  const offsets = [];
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) offsets.push([dx, dy]);
  const nCells = cols * rows_;
  const votes = Array.from({ length: nCells }, () => []);

  for (const [dx, dy] of offsets) {
    const cb = colBounds.map(c => c + dx);
    const rb = rowBounds.map(r => r + dy);
    const cells = [];
    for (let r = 0; r < rows_; r++) for (let c = 0; c < cols; c++) {
      cells.push(importCropCell(sourceCanvas, cb[c], rb[r], cb[c + 1], rb[r + 1], 1));
    }
    for (let i = 0; i < cells.length; i++) votes[i].push(importMatchCell(cells[i], importRefCanvases));
  }

  const results = votes.map(v => importMode(v));
  return { results };
}

// ---- wiring: pick a file, it sets the sprites ----
const importAmountEl = document.getElementById('importAmount');
const importColsEl = document.getElementById('importCols');
const importFileEl = document.getElementById('importFile');

if (importFileEl) {
  importFileEl.addEventListener('change', async () => {
    const file = importFileEl.files[0];
    if (!file) return;

    const amount = Math.max(1, parseInt(importAmountEl.value, 10) || 0);
    const cols = Math.max(1, parseInt(importColsEl.value, 10) || 9);
    const rows_ = Math.ceil(amount / cols);

    const dataUrl = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
    const img = await loadImageAsync(dataUrl);
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.width;
    srcCanvas.height = img.height;
    srcCanvas.getContext('2d').drawImage(img, 0, 0);

    const { results } = await readCompassesFromImage(srcCanvas, cols, rows_);
    const trimmed = results.slice(0, amount);

    const newRows = trimmed.map((res, i) => {
      const existing = rows[i];
      return {
        id: existing ? existing.id : nextId++,
        x: existing ? existing.x : '',
        z: existing ? existing.z : '',
        sprite: res.value
      };
    });
    rows = newRows;
    renderRows();
    importFileEl.value = '';
  });
}
