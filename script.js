const rowsEl = document.getElementById('rows');
const addRowBtn = document.getElementById('addRow');
const estimateBtn = document.getElementById('estimate');
const resultPanel = document.getElementById('resultPanel');
const spriteModal = document.getElementById('spriteModal');
const compassImg = document.getElementById('compassImg');
const compassLabel = document.getElementById('compassLabel');
const spritePrevBtn = document.getElementById('spritePrev');
const spriteNextBtn = document.getElementById('spriteNext');
const confirmSpriteBtn = document.getElementById('confirmSprite');
const closeModalBtn = document.getElementById('closeModal');
const rowHintEl = document.getElementById('rowHint');
const formErrorEl = document.getElementById('formError');
const jsonErrorEl = document.getElementById('jsonError');
const arrangementBox = document.getElementById('arrangementBox');
const arrangementFill = document.getElementById('arrangementFill');
const arrangementPct = document.getElementById('arrangementPct');

function copyText(el, text) {
  navigator.clipboard.writeText(text).catch(() => {});
  el.classList.add('copied');
  clearTimeout(el._copyTimeout);
  el._copyTimeout = setTimeout(() => el.classList.remove('copied'), 1000);
}

const mainReadout = document.getElementById('mainReadout');
mainReadout.addEventListener('click', () => {
  const x = document.getElementById('outX').textContent;
  const z = document.getElementById('outZ').textContent;
  if (x === '-') return;
  copyText(mainReadout, x + ', ' + z);
});

let rows = [];
let nextId = 0;
let modalTargetRowId = null;
let modalSprite = 0;
let lastAddedId = null;

function isValidCoord(v) {
  return v !== '' && Number.isFinite(parseFloat(v));
}

function showFormError(msg) {
  formErrorEl.textContent = msg;
  formErrorEl.style.display = msg ? 'block' : 'none';
}

function spritePath(i) {
  return 'compass_textures/compass_' + String(i).padStart(2, '0') + '.png';
}

function addRow(x, z, sprite) {
  const id = nextId++;
  rows.push({ id, x: x !== undefined ? x : '', z: z !== undefined ? z : '', sprite: sprite !== undefined ? sprite : 0 });
  lastAddedId = id;
  renderRows();
}

function renderRows() {
  rowsEl.innerHTML = '';
  if (rows.length === 0) {
    rowsEl.innerHTML = '<div class="empty-state">No lodestones yet — add at least 2.</div>';
  } else {
    rows.forEach(row => {
      const div = document.createElement('div');
      div.className = 'row';
      div.dataset.id = row.id;
      const xInvalid = row.x !== '' && !isValidCoord(row.x);
      const zInvalid = row.z !== '' && !isValidCoord(row.z);
      div.innerHTML =
        '<div class="coord"><label>X</label><input type="number" class="in-x' + (xInvalid ? ' invalid' : '') + '" value="' + row.x + '"></div>' +
        '<div class="coord"><label>Z</label><input type="number" class="in-z' + (zInvalid ? ' invalid' : '') + '" value="' + row.z + '"></div>' +
        '<div class="sprite-picker" tabindex="0" role="button" aria-label="Compass sprite ' + row.sprite + ', click to change">' +
          '<img src="' + spritePath(row.sprite) + '">' +
          '<span>#' + String(row.sprite).padStart(2, '0') + '</span>' +
        '</div>' +
        '<button class="remove-row" aria-label="Remove lodestone" title="Remove">&times;</button>';
      rowsEl.appendChild(div);
    });
  }
  if (lastAddedId !== null) {
    const el = rowsEl.querySelector('.row[data-id="' + lastAddedId + '"] .in-x');
    if (el) el.focus();
    lastAddedId = null;
  }
  updateEstimateState();
}

// Score how well-SPREAD the lodestone POSITIONS are, ignoring orientation/sprite
// entirely. Nearly-collinear lodestones make triangulation poorly conditioned
// no matter what the true bearings turn out to be, so this looks at the (x,z)
// point cloud itself: build its covariance matrix and score by the eigenvalue
// ratio. 100% = points spread evenly in both directions (no dominant axis),
// 0% = points fall on (or near) a single line.
function arrangementScore(points) {
  if (points.length < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const mz = points.reduce((s, p) => s + p.z, 0) / points.length;
  let Sxx = 0, Sxz = 0, Szz = 0;
  points.forEach(p => {
    const dx = p.x - mx, dz = p.z - mz;
    Sxx += dx * dx; Sxz += dx * dz; Szz += dz * dz;
  });
  const trace = Sxx + Szz;
  const diff = Math.sqrt(((Sxx - Szz) / 2) ** 2 + Sxz * Sxz);
  const lambdaMax = trace / 2 + diff;
  const lambdaMin = trace / 2 - diff;
  if (lambdaMax <= 1e-9) return 0;
  return Math.max(0, Math.min(100, (lambdaMin / lambdaMax) * 100));
}

function updateArrangementDisplay() {
  const points = rows
    .filter(r => isValidCoord(r.x) && isValidCoord(r.z))
    .map(r => ({ x: parseFloat(r.x), z: parseFloat(r.z) }));
  const score = arrangementScore(points);
  if (score === null) {
    arrangementBox.style.display = 'none';
    return;
  }
  arrangementBox.style.display = 'flex';
  const pct = Math.round(score);
  arrangementFill.style.width = pct + '%';
  arrangementPct.textContent = pct + '%';
  // red -> yellow -> green as the arrangement improves
  const color = pct < 40 ? '#a55' : pct < 70 ? '#c9a04a' : '#5a9e5a';
  arrangementFill.style.background = color;
}

function updateEstimateState() {
  const validCount = rows.filter(r => isValidCoord(r.x) && isValidCoord(r.z)).length;
  estimateBtn.disabled = validCount < 2;
  if (rows.length === 0) {
    rowHintEl.textContent = '';
  } else if (validCount < 2) {
    rowHintEl.textContent = 'Add at least 2 lodestones with numeric X/Z coordinates.';
  } else if (validCount < 3) {
    rowHintEl.textContent = 'Tip: a 3rd lodestone (from a different direction) gives a tighter, more reliable estimate.';
  } else {
    rowHintEl.textContent = '';
  }
  showFormError('');
  updateArrangementDisplay();
}

rowsEl.addEventListener('input', e => {
  const rowDiv = e.target.closest('.row');
  const id = parseInt(rowDiv.dataset.id);
  const row = rows.find(r => r.id === id);
  if (e.target.classList.contains('in-x')) row.x = e.target.value;
  if (e.target.classList.contains('in-z')) row.z = e.target.value;
  const invalid = e.target.value !== '' && !isValidCoord(e.target.value);
  e.target.classList.toggle('invalid', invalid);
  updateEstimateState();
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

rowsEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const picker = e.target.closest('.sprite-picker');
  if (!picker) return;
  e.preventDefault();
  const rowDiv = picker.closest('.row');
  openSpriteModal(parseInt(rowDiv.dataset.id));
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

spritePrevBtn.addEventListener('click', () => {
  modalSprite = (modalSprite + 31) % 32;
  renderCompass();
});

spriteNextBtn.addEventListener('click', () => {
  modalSprite = (modalSprite + 1) % 32;
  renderCompass();
});

confirmSpriteBtn.addEventListener('click', () => {
  const row = rows.find(r => r.id === modalTargetRowId);
  if (row) row.sprite = modalSprite;
  closeSpriteModal();
  renderRows();
});

closeModalBtn.addEventListener('click', () => {
  closeSpriteModal();
});

spriteModal.addEventListener('click', e => {
  if (e.target === spriteModal) closeSpriteModal();
});

document.addEventListener('keydown', e => {
  if (!spriteModal.classList.contains('open')) return;
  if (e.key === 'Escape') { closeSpriteModal(); return; }
  if (e.key === 'ArrowLeft') { spritePrevBtn.click(); return; }
  if (e.key === 'ArrowRight') { spriteNextBtn.click(); return; }
  if (e.key === 'Enter') { confirmSpriteBtn.click(); return; }
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
  const distances = estimates.map(p => Math.hypot(p.x - med.x, p.z - med.z)).sort((a, b) => a - b);
  const spread = distances[Math.floor(distances.length * 0.9)];
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

function estimate() {
  const valid = rows
    .map(r => ({ x: parseFloat(r.x), z: parseFloat(r.z), sprite: r.sprite }))
    .filter(r => Number.isFinite(r.x) && Number.isFinite(r.z));

  if (valid.length < 2) {
    showFormError('Add at least 2 lodestones with numeric X/Z coordinates.');
    return;
  }
  showFormError('');

  const angles = valid.map(r => ((r.sprite + 17.5) / 32) * 2 * Math.PI);
  const halfRes = (2 * Math.PI / 32) / 2;
  const numRolls = 5;

  let candidateA = null;
  if (valid.length >= 3) {
    const maxExclude = Math.min(2, valid.length - 3);
    const w = wedgeSolve(valid, angles, halfRes, maxExclude);
    if (w) candidateA = { pos: w.pos, poly: w.poly, uncertainty: w.uncertainty, excluded: w.excluded, method: 'exact intersection' };
  }

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
    showFormError('Lodestone readings are too close to parallel to solve. Use lodestones spread further apart.');
    resultPanel.style.display = 'none';
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
  renderMap(usedValid, usedAngles, halfRes, chosen.pos, chosen.poly || null);
  resultPanel.style.display = 'block';
}

function renderMap(ls, angles, halfRes, pos, poly) {
  const overviewSvg = document.getElementById('resultMap');
  const detailSvg = document.getElementById('resultMapDetail');
  const overviewLabel = document.getElementById('overviewLabel');
  const detailLabel = document.getElementById('detailLabel');
  const vertBox = document.getElementById('polyVertices');
  if (!poly || poly.length < 3) {
    overviewSvg.innerHTML = ''; overviewSvg.style.display = 'none'; overviewLabel.style.display = 'none';
    detailSvg.innerHTML = ''; detailSvg.style.display = 'none'; detailLabel.style.display = 'none';
    vertBox.style.display = 'none';
    return;
  }

  function computeBox(boundsPts) {
    const xs = boundsPts.map(p => p.x), zs = boundsPts.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const spanX = Math.max(maxX - minX, 1), spanZ = Math.max(maxZ - minZ, 1);
    const pad = Math.max(spanX, spanZ) * 0.25;
    return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  }

  function drawSvg(el, boundsPts, drawLodestones, drawWedges) {
    const box = computeBox(boundsPts);
    const w = 400, h = 400;
    const scale = Math.min(w / (box.maxX - box.minX), h / (box.maxZ - box.minZ));
    const toSvg = p => ({ x: (p.x - box.minX) * scale, y: (p.z - box.minZ) * scale });

    let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">';
    if (drawWedges) {
      ls.forEach((r, i) => {
        const wedgePoly = wedgeIntersection([r], [angles[i]], halfRes, box);
        if (!wedgePoly) return;
        const pts = wedgePoly.map(p => { const t = toSvg(p); return t.x + ',' + t.y; }).join(' ');
        s += '<polygon points="' + pts + '" fill="#e0a030" fill-opacity="0.07" stroke="#e0a030" stroke-opacity="0.35" stroke-width="1"/>';
      });
    }
    const polyPts = poly.map(p => { const t = toSvg(p); return t.x + ',' + t.y; }).join(' ');
    s += '<polygon points="' + polyPts + '" fill="#3a5a8a" fill-opacity="0.45" stroke="#6a8ac0" stroke-width="2"/>';
    if (drawLodestones) {
      ls.forEach(r => {
        const t = toSvg(r);
        s += '<circle cx="' + t.x + '" cy="' + t.y + '" r="4" fill="#e0a030"/>';
      });
    }
    const tp = toSvg(pos);
    s += '<circle cx="' + tp.x + '" cy="' + tp.y + '" r="5" fill="#e05050" stroke="#fff" stroke-width="1.5"/>';
    s += '</svg>';
    el.innerHTML = s;
    el.style.display = 'block';
  }

  drawSvg(overviewSvg, [...ls, ...poly, pos], true, true);
  overviewLabel.style.display = 'block';
  drawSvg(detailSvg, [...poly, pos], false, false);
  detailLabel.style.display = 'block';

  vertBox.style.display = 'block';
  vertBox.textContent = 'Feasible region vertices: ' +
    poly.map(p => '(' + p.x.toFixed(0) + ', ' + p.z.toFixed(0) + ')').join('  ');
}

estimateBtn.addEventListener('click', estimate);

function showJsonError(msg) {
  jsonErrorEl.textContent = msg;
  jsonErrorEl.style.display = msg ? 'block' : 'none';
}

document.getElementById('loadJson').addEventListener('click', () => {
  const raw = document.getElementById('jsonInput').value.trim();
  if (!raw) { showJsonError('Paste some JSON first.'); return; }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    showJsonError('Could not parse that JSON: ' + e.message);
    return;
  }
  if (!Array.isArray(data)) {
    showJsonError('JSON should be an array of { x, z, sprite } objects.');
    return;
  }
  showJsonError('');
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
