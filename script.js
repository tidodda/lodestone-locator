const rowsEl = document.getElementById('rows');
const addRowBtn = document.getElementById('addRow');
const estimateBtn = document.getElementById('estimate');
const resultPanel = document.getElementById('resultPanel');
const spriteModal = document.getElementById('spriteModal');
const spriteGrid = document.getElementById('spriteGrid');
const closeModalBtn = document.getElementById('closeModal');
const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');

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

function solvePosition(ls, angles) {
  let Sxx = 0, Sxy = 0, Syy = 0, Sxc = 0, Syc = 0;
  ls.forEach((r, i) => {
    const a = Math.sin(angles[i]);
    const b = -Math.cos(angles[i]);
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
  if (ls.length < 4) return solvePosition(ls, angles);

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
    const pos = solvePosition(subLs, subAngles);
    if (pos) estimates.push(pos);
  }
  if (estimates.length === 0) return solvePosition(ls, angles);
  return geometricMedian(estimates, 40);
}

function estimate() {
  const valid = rows
    .map(r => ({ x: parseFloat(r.x), z: parseFloat(r.z), sprite: r.sprite }))
    .filter(r => Number.isFinite(r.x) && Number.isFinite(r.z));

  if (valid.length < 2) {
    alert('Add at least 2 lodestones with coordinates.');
    return;
  }

  const angles = valid.map(r => ((r.sprite + 0.5) / 32) * 2 * Math.PI);

  const pos = ensembleSolve(valid, angles);
  if (!pos) {
    alert('Lodestone readings are too close to parallel to solve. Use lodestones spread further apart.');
    return;
  }
  const px = pos.x, pz = pos.z;

  let sumSqDeg = 0;
  let nearest = Infinity;
  valid.forEach((r, i) => {
    const predicted = Math.atan2(r.z - pz, r.x - px);
    const diff = wrap(predicted - angles[i]);
    sumSqDeg += (diff * 180 / Math.PI) ** 2;
    const dist = Math.hypot(r.x - px, r.z - pz);
    if (dist < nearest) nearest = dist;
  });
  const rmsDeg = Math.sqrt(sumSqDeg / valid.length);

  const halfRes = (2 * Math.PI / 32) / 2;
  const uncertainty = Math.round(nearest * halfRes);

  document.getElementById('outX').textContent = px.toFixed(1);
  document.getElementById('outZ').textContent = pz.toFixed(1);
  document.getElementById('outUncertainty').textContent = '±' + uncertainty.toLocaleString();
  document.getElementById('outResidual').textContent = rmsDeg.toFixed(2) + '°';
  resultPanel.style.display = 'block';

  drawPreview(valid, px, pz);
  showNextRoundGuidance(valid, angles, px, pz);
}

// sigma of a uniform distribution over one 11.25 degree bin (32 states): width/sqrt(12)
const SIGMA_THETA = ((360 / 32) / Math.sqrt(12)) * Math.PI / 180;

function computeSemiMajorAxis(ls, angles, px, pz) {
  let Sxx = 0, Sxy = 0, Syy = 0;
  ls.forEach((l, i) => {
    const dx = px - l.x, dz = pz - l.z;
    const d2 = dx * dx + dz * dz || 1e-6;
    const a = Math.sin(angles[i]), b = -Math.cos(angles[i]);
    const w = 1 / d2;
    Sxx += w * a * a; Sxy += w * a * b; Syy += w * b * b;
  });
  const det = Sxx * Syy - Sxy * Sxy;
  const scale = Sxx * Syy;
  if (scale <= 0 || Math.abs(det) < scale * 1e-9) return null;
  const iXX = Syy / det, iXZ = -Sxy / det, iZZ = Sxx / det;
  const covXX = SIGMA_THETA * SIGMA_THETA * iXX;
  const covXZ = SIGMA_THETA * SIGMA_THETA * iXZ;
  const covZZ = SIGMA_THETA * SIGMA_THETA * iZZ;
  const tr = covXX + covZZ, dif = (covXX - covZZ) / 2;
  const disc = Math.sqrt(dif * dif + covXZ * covXZ);
  const lambda1 = tr / 2 + disc;
  return Math.sqrt(Math.max(lambda1, 0));
}

function showNextRoundGuidance(valid, angles, px, pz) {
  const panel = document.getElementById('nextRoundPanel');
  const semiMajor = computeSemiMajorAxis(valid, angles, px, pz);
  if (!semiMajor) {
    panel.style.display = 'none';
    return;
  }

  // typical case ~1.5x semiMajor; empirically the tail is heavy, so the "safe"
  // radius uses a much larger multiplier to actually cover bad-geometry cases
  const typicalRadius = Math.round(semiMajor * 1.5);
  const safeRadius = Math.round(semiMajor * 13);

  document.getElementById('outTypicalRadius').textContent = '≈' + typicalRadius.toLocaleString();
  document.getElementById('outSafeRadius').textContent = '≈' + safeRadius.toLocaleString();

  const ringRadius = safeRadius * 1.75;
  const suggestedCount = 6;
  const suggestions = [];
  for (let i = 0; i < suggestedCount; i++) {
    const ang = (i / suggestedCount) * 2 * Math.PI;
    suggestions.push({
      x: Math.round(px + ringRadius * Math.cos(ang)),
      z: Math.round(pz + ringRadius * Math.sin(ang)),
      sprite: 0
    });
  }
  document.getElementById('nextRoundJson').value = JSON.stringify(suggestions, null, 2);

  panel.style.display = 'block';
}

function drawPreview(lodestones, px, pz) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const allX = lodestones.map(l => l.x).concat([px]);
  const allZ = lodestones.map(l => l.z).concat([pz]);
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const minZ = Math.min(...allZ), maxZ = Math.max(...allZ);
  const pad = 40;
  const scaleX = (canvas.width - pad * 2) / Math.max(maxX - minX, 1);
  const scaleZ = (canvas.height - pad * 2) / Math.max(maxZ - minZ, 1);
  const scale = Math.min(scaleX, scaleZ);

  function toPixel(x, z) {
    return { x: pad + (x - minX) * scale, y: pad + (z - minZ) * scale };
  }

  lodestones.forEach((l, i) => {
    const p = toPixel(l.x, l.z);
    ctx.fillStyle = '#5ab08a';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ccc';
    ctx.font = '11px sans-serif';
    ctx.fillText('L' + (i + 1), p.x + 9, p.y - 8);
  });

  const est = toPixel(px, pz);
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.arc(est.x, est.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd24a';
  ctx.fillText('estimate', est.x + 10, est.y - 8);
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
