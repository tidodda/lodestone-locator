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

function estimate() {
  const valid = rows
    .map(r => ({ x: parseFloat(r.x), z: parseFloat(r.z), sprite: r.sprite }))
    .filter(r => Number.isFinite(r.x) && Number.isFinite(r.z));

  if (valid.length < 2) {
    alert('Add at least 2 lodestones with coordinates.');
    return;
  }

  const angles = valid.map(r => ((r.sprite + 0.5) / 32) * 2 * Math.PI);

  // each reading gives: sin(angle)*px - cos(angle)*pz = sin(angle)*Lx - cos(angle)*Lz
  let Sxx = 0, Sxy = 0, Syy = 0, Sxc = 0, Syc = 0;
  valid.forEach((r, i) => {
    const a = Math.sin(angles[i]);
    const b = -Math.cos(angles[i]);
    const c = a * r.x + b * r.z;
    Sxx += a * a;
    Sxy += a * b;
    Syy += b * b;
    Sxc += a * c;
    Syc += b * c;
  });

  const det = Sxx * Syy - Sxy * Sxy;
  if (Math.abs(det) < 1e-9) {
    alert('Lodestone readings are too close to parallel to solve. Use lodestones spread further apart.');
    return;
  }

  const px = (Sxc * Syy - Syc * Sxy) / det;
  const pz = (Sxx * Syc - Sxy * Sxc) / det;

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

const roundsSlider = document.getElementById('simRounds');
const roundsVal = document.getElementById('roundsVal');
roundsSlider.addEventListener('input', () => {
  roundsVal.textContent = roundsSlider.value;
});

function fitFromLodestones(lodestones, target) {
  const readings = lodestones.map(l => {
    const trueAngle = Math.atan2(target.z - l.z, target.x - l.x);
    let rot = trueAngle / (2 * Math.PI);
    rot = ((rot % 1) + 1) % 1;
    return Math.floor(rot * 32) % 32;
  });
  const angles = readings.map(s => ((s + 0.5) / 32) * 2 * Math.PI);

  let Sxx = 0, Sxy = 0, Syy = 0, Sxc = 0, Syc = 0;
  lodestones.forEach((r, i) => {
    const a = Math.sin(angles[i]);
    const b = -Math.cos(angles[i]);
    const c = a * r.x + b * r.z;
    Sxx += a * a; Sxy += a * b; Syy += b * b; Sxc += a * c; Syc += b * c;
  });
  const det = Sxx * Syy - Sxy * Sxy;
  if (Math.abs(det) < 1e-6) return null;

  const px = (Sxc * Syy - Syc * Sxy) / det;
  const pz = (Sxx * Syc - Sxy * Sxc) / det;
  return { x: px, z: pz };
}

function scatterAround(center, width, n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      x: center.x + (Math.random() - 0.5) * width,
      z: center.z + (Math.random() - 0.5) * width
    });
  }
  return arr;
}

document.getElementById('runSim').addEventListener('click', () => {
  const perRound = Math.max(3, parseInt(document.getElementById('simPerRound').value) || 12);
  const numRounds = parseInt(roundsSlider.value) || 4;

  const WORLD = 60000000;
  const trueTarget = { x: (Math.random() - 0.5) * WORLD, z: (Math.random() - 0.5) * WORLD };

  let center = { x: 0, z: 0 };
  let regionWidth = WORLD;

  const simRows = document.getElementById('simRows');
  simRows.innerHTML = '';
  document.getElementById('simTable').style.display = 'table';

  for (let round = 1; round <= numRounds; round++) {
    const lodestones = scatterAround(center, regionWidth, perRound);
    const fit = fitFromLodestones(lodestones, trueTarget);

    if (!fit) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + round + '</td><td colspan="2">degenerate, skipped</td>';
      simRows.appendChild(tr);
      continue;
    }

    const error = Math.hypot(fit.x - trueTarget.x, fit.z - trueTarget.z);

    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + round + '</td>' +
      '<td>' + Math.round(regionWidth).toLocaleString() + '</td>' +
      '<td>' + Math.round(error).toLocaleString() + '</td>';
    simRows.appendChild(tr);

    center = fit;
    regionWidth = Math.max(error * 2.5, 50);
  }
});