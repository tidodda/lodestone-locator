const rowsEl = document.getElementById('rows');
const addRowBtn = document.getElementById('addRow');
const estimateBtn = document.getElementById('estimate');
const resultPanel = document.getElementById('resultPanel');
const spriteModal = document.getElementById('spriteModal');
const spriteGrid = document.getElementById('spriteGrid');
const closeModalBtn = document.getElementById('closeModal');

let rows = [];
let nextId = 0;
let modalTargetRowId = null;

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

function openSpriteModal(rowId) {
  modalTargetRowId = rowId;
  spriteGrid.innerHTML = '';
  for (let i = 0; i < 32; i++) {
    const opt = document.createElement('div');
    opt.className = 'sprite-option';
    opt.dataset.sprite = i;
    opt.innerHTML = '<img src="' + spritePath(i) + '"><span>' + String(i).padStart(2, '0') + '</span>';
    spriteGrid.appendChild(opt);
  }
  spriteModal.classList.add('open');
}

spriteGrid.addEventListener('click', e => {
  const opt = e.target.closest('.sprite-option');
  if (!opt) return;
  const row = rows.find(r => r.id === modalTargetRowId);
  row.sprite = parseInt(opt.dataset.sprite);
  spriteModal.classList.remove('open');
  renderRows();
});

closeModalBtn.addEventListener('click', () => {
  spriteModal.classList.remove('open');
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

// Iteratively reweighted least squares: closer lodestones get more weight,
// since the same angular error covers less ground distance-wise.
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

function ensembleSolve(ls, angles) {
  if (ls.length < 4) {
    const pos = weightedSolve(ls, angles);
    return pos ? { ...pos, spread: 0 } : null;
  }

  const subsetSize = Math.min(6, ls.length - 1);
  const numSubsets = 60;
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
    return pos ? { ...pos, spread: 0 } : null;
  }
  const med = geometricMedian(estimates, 40);
  // spread of the ensemble = real uncertainty, including bad-geometry amplification
  const distances = estimates.map(p => Math.hypot(p.x - med.x, p.z - med.z)).sort((a, b) => a - b);
  const spread = distances[Math.floor(distances.length * 0.9)]; // 90th percentile
  return { ...med, spread };
}

function runRolls(ls, angles, numRolls, halfRes) {
  let best = null;
  for (let roll = 0; roll < numRolls; roll++) {
    const pos = ensembleSolve(ls, angles);
    if (!pos) continue;
    let nearest = Infinity;
    ls.forEach(r => {
      const dist = Math.hypot(r.x - pos.x, r.z - pos.z);
      if (dist < nearest) nearest = dist;
    });
    const baseline = nearest * halfRes;
    const uncertainty = Math.max(baseline, pos.spread || 0);
    if (!best || uncertainty < best.uncertainty) best = { pos, uncertainty };
  }
  return best;
}

// ---- Exact wedge-intersection algorithm ----
// A compass reading isn't noise around a center angle - it's a hard constraint:
// "the true bearing lies somewhere in this 11.25 degree sector." Each reading
// therefore defines a wedge (2 half-planes) the target must lie inside. Intersecting
// all wedges gives the exact feasible region - tighter and more honest than curve
// fitting through sector centers, and its size is a real uncertainty bound.
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
// Finds the exact feasible region, dropping the fewest possible readings to
// resolve any inconsistency. Candidates are scored by how well the resulting
// position fits ALL readings (90th-percentile bearing residual across the full
// set), not by how small the resulting region is - a tiny region can arise from
// a coincidental near-parallel overlap between the WRONG readings and be totally
// wrong, even though it looks maximally "confident". Extra exclusions are only
// accepted if they meaningfully improve that full-set fit (avoids overfitting
// by discarding valid readings just to shrink the region).
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
    return { pos: c, uncertainty: maxVertexDist(poly, c), excluded: excl, fitScore: worst };
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
    // only take on more exclusions if they clearly improve the fit
    if (!overallBest || bestForK.fitScore < overallBest.fitScore - 2) overallBest = bestForK;
    else break;
  }
  return overallBest;
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
  const numRolls = 5; // fallback-path only (used when wedge intersection can't run)

  // Algorithm A: exact wedge intersection (tightest possible, but needs >=3
  // lodestones and can fail to find a feasible region if too many are noisy)
  let candidateA = null;
  if (valid.length >= 3) {
    const maxExclude = Math.min(2, valid.length - 3);
    const w = wedgeSolve(valid, angles, halfRes, maxExclude);
    if (w) candidateA = { pos: w.pos, uncertainty: w.uncertainty, excluded: w.excluded, method: 'exact intersection' };
  }

  // Algorithm B: weighted least-squares over random ensembles (always available,
  // degrades gracefully, its own residual-based outlier pass)
  let candidateB = null;
  {
    let best = runRolls(valid, angles, numRolls, halfRes);
    if (best) {
      function residualsDeg(pos) {
        return valid.map((r, i) => {
          const predicted = Math.atan2(r.z - pos.z, r.x - pos.x);
          return Math.abs(wrap(predicted - angles[i]) * 180 / Math.PI);
        });
      }
      const resid = residualsDeg(best.pos);
      const sorted = [...resid].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const mad = [...resid].map(v => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)] || 1;
      const outlierIdx = [];
      resid.forEach((v, i) => {
        if (v > median + Math.max(6 * mad, 15) && valid.length - outlierIdx.length > 3) outlierIdx.push(i);
      });
      if (outlierIdx.length > 0) {
        const keep = valid.map((_, i) => i).filter(i => !outlierIdx.includes(i));
        const refit = runRolls(keep.map(i => valid[i]), keep.map(i => angles[i]), numRolls, halfRes);
        if (refit) best = refit;
      }
      candidateB = { pos: best.pos, uncertainty: best.uncertainty, excluded: outlierIdx, method: 'weighted least-squares (ensemble)' };
    }
  }

  if (!candidateA && !candidateB) {
    alert('Lodestone readings are too close to parallel to solve. Use lodestones spread further apart.');
    return;
  }
  const chosen = (candidateA && (!candidateB || candidateA.uncertainty <= candidateB.uncertainty)) ? candidateA : candidateB;

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

  // Geometry warning: bearings too clustered (near-parallel) amplify any error a lot.
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
  warnEl.style.display = warnings.length ? 'block' : 'none';
  warnEl.textContent = warnings.join(' ');

  document.getElementById('outX').textContent = px.toFixed(1);
  document.getElementById('outZ').textContent = pz.toFixed(1);
  document.getElementById('outUncertainty').textContent = '±' + uncertainty.toLocaleString();
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
