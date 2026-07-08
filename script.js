const playerXInput = document.getElementById('playerX');
const playerZInput = document.getElementById('playerZ');
const targetXInput = document.getElementById('targetX');
const targetZInput = document.getElementById('targetZ');

const outDx = document.getElementById('outDx');
const outDz = document.getElementById('outDz');
const outAngleRad = document.getElementById('outAngleRad');
const outAngleDeg = document.getElementById('outAngleDeg');
const outRotation = document.getElementById('outRotation');
const outSprite = document.getElementById('outSprite');

const compassImg = document.getElementById('compassImg');
const spriteSelect = document.getElementById('spriteSelect');
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

let manualSprite = null;

for (let i = 0; i < 32; i++) {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = 'compass_' + String(i).padStart(2, '0');
  spriteSelect.appendChild(opt);
}

function spriteName(index) {
  return 'compass_textures/compass_' + String(index).padStart(2, '0') + '.png';
}

function calculate() {
  const playerX = parseFloat(playerXInput.value) || 0;
  const playerZ = parseFloat(playerZInput.value) || 0;
  const targetX = parseFloat(targetXInput.value) || 0;
  const targetZ = parseFloat(targetZInput.value) || 0;

  const dx = targetX - playerX;
  const dz = targetZ - playerZ;

  const angle = Math.atan2(dz, dx);
  const angleDeg = angle * (180 / Math.PI);

  let rotation = angle / (2 * Math.PI);
  rotation = ((rotation % 1) + 1) % 1; // wrap into 0-1

  let sprite = Math.floor(rotation * 32) % 32;

  outDx.textContent = dx.toFixed(2);
  outDz.textContent = dz.toFixed(2);
  outAngleRad.textContent = angle.toFixed(4);
  outAngleDeg.textContent = angleDeg.toFixed(2);
  outRotation.textContent = rotation.toFixed(4);
  outSprite.textContent = sprite;

  if (manualSprite === null) {
    compassImg.src = spriteName(sprite);
    spriteSelect.value = sprite;
  }

  drawPreview(playerX, playerZ, targetX, targetZ, angle);
}

function drawPreview(playerX, playerZ, targetX, targetZ, angle) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = 4;
  const originX = canvas.width / 2;
  const originY = canvas.height / 2;

  const px = originX + playerX * 0; // player is always drawn at center
  const py = originY;

  const tx = originX + (targetX - playerX) * scale;
  const ty = originY + (targetZ - playerZ) * scale;

  // clamp target point so it stays inside the canvas visually
  const clampedTx = Math.max(20, Math.min(canvas.width - 20, tx));
  const clampedTy = Math.max(20, Math.min(canvas.height - 20, ty));

  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(clampedTx, clampedTy);
  ctx.stroke();

  ctx.fillStyle = '#5ab0ff';
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ccc';
  ctx.font = '12px sans-serif';
  ctx.fillText('Player', px + 10, py - 10);

  ctx.fillStyle = '#ff6a5a';
  ctx.beginPath();
  ctx.arc(clampedTx, clampedTy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText('Target', clampedTx + 10, clampedTy - 10);

  // little arrow showing compass direction from player
  const arrowLen = 30;
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(angle) * arrowLen, py + Math.sin(angle) * arrowLen);
  ctx.stroke();
}

[playerXInput, playerZInput, targetXInput, targetZInput].forEach(input => {
  input.addEventListener('input', () => {
    manualSprite = null;
    calculate();
  });
});

spriteSelect.addEventListener('change', () => {
  manualSprite = parseInt(spriteSelect.value);
  compassImg.src = spriteName(manualSprite);
});

calculate();
