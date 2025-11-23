const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 32;
const WORLD_SIZE = 800; // tiles per side (expanded world)
const params = new URLSearchParams(window.location.search);
const seedParam = parseInt(params.get('seed'), 10);
const SEED = Number.isFinite(seedParam) ? seedParam : Math.floor(Math.random() * 1_000_000_000);
const SHIP_RADIUS = 80;
const FIRE_RADIUS = 90;
const FIRE_LIGHT_RADIUS = FIRE_RADIUS * 3; // illumination punches much farther than warmth
const RESCUE_COST = { oil: 20, scrap: 20 };
const CAMPFIRE_COST = 3;
const GAMMA = 1.2; // Tweak to globally brighten/dim terrain rendering

const world = WorldGen.generateWorld(SEED, WORLD_SIZE);
const { TILE, RESOURCE } = world;

let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

const player = new Entities.Player(WORLD_SIZE * TILE_SIZE / 2, WORLD_SIZE * TILE_SIZE / 2);
const campfires = [];

let keys = {};
let timeOfDay = 0; // seconds
let beaconArmed = false;
let rescueTimer = 0;
let hints = [
  'WASD / Arrow Keys to move',
  'E to gather, Q to eat, F to build fire',
  'Stay warm near fires or the ship!',
  'Beacon needs 20 Oil and 20 Scrap Parts'
];

function handleInput(dt) {
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;

  if (dx !== 0 || dy !== 0) {
    player.move(dx, dy, dt, isBlocked);
  } else {
    player.rest(dt);
  }
}

function isBlocked(px, py) {
  const tx = Math.floor(px / TILE_SIZE);
  const ty = Math.floor(py / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= WORLD_SIZE || ty >= WORLD_SIZE) return true;
  const tile = world.tiles[ty * WORLD_SIZE + tx];
  return tile === TILE.WATER || tile === TILE.ROCK;
}

function update(dt) {
  timeOfDay = (timeOfDay + dt) % 120; // 2 minute day cycle
  handleInput(dt);
  updateSurvival(dt);
  updateCampfires(dt);
  checkResourcePickup();
  checkBeacon(dt);
  UI.updateHUD(player, hints, { seed: SEED, day: Math.floor(timeOfDay / 120 * 4) + 1, beaconCost: RESCUE_COST });
}

function updateSurvival(dt) {
  // Heat gain near ship or active fire
  const nearShip = distance(player.x, player.y, WORLD_SIZE * TILE_SIZE / 2, WORLD_SIZE * TILE_SIZE / 2) < SHIP_RADIUS;
  const nearFire = campfires.some(f => f.active && distance(player.x, player.y, f.x, f.y) < FIRE_RADIUS);
  const isNight = timeOfDay > 70 && timeOfDay < 110;

  if (nearShip) {
    player.warmth = Math.min(100, player.warmth + 25 * dt);
    player.energy = Math.min(100, player.energy + 25 * dt);
  }
  if (nearFire && !nearShip) {
    player.warmth = Math.min(100, player.warmth + 20 * dt);
  }

  const chillRate = (isNight ? 8 : 4) * (nearShip || nearFire ? 0.2 : 1);
  player.warmth = Math.max(0, player.warmth - chillRate * dt);

  if (player.warmth < 25) {
    player.health = Math.max(0, player.health - dt * (nearShip ? 1 : 4));
  }

  if (player.health <= 0) {
    UI.showOverlay('You succumbed to the cold. Refresh to try again.');
    stopGame();
  }
}

function updateCampfires(dt) {
  campfires.forEach(f => f.update(dt));
}

function checkResourcePickup() {
  world.resources.forEach(res => {
    if (res.collected) return;
    const rx = res.x * TILE_SIZE + TILE_SIZE / 2;
    const ry = res.y * TILE_SIZE + TILE_SIZE / 2;
    if (distance(player.x, player.y, rx, ry) < 22) {
      if (Entities.collectResource(player, res)) {
        if (res.type === RESOURCE.WOOD && !hints.includes('Press F to place a campfire (3 wood)')) {
          hints.push('Press F to place a campfire (3 wood)');
        }
      }
    }
  });
}

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.hypot(dx, dy);
}

function checkBeacon(dt) {
  if (beaconArmed) {
    rescueTimer += dt;
    if (rescueTimer > 20) {
      UI.showOverlay('Rescued! You signaled long enough to be found.');
      stopGame();
    }
    return;
  }

  if (nearShip()) {
    const ready = Object.keys(RESCUE_COST).every(k => (player.inventory[k] || 0) >= RESCUE_COST[k]);
    if (ready && !hints.includes('Press B at the ship to arm the beacon')) {
      hints.push('Press B at the ship to arm the beacon');
    }
  }
}

function nearShip() {
  return distance(player.x, player.y, WORLD_SIZE * TILE_SIZE / 2, WORLD_SIZE * TILE_SIZE / 2) < SHIP_RADIUS;
}

function buildCampfire() {
  if (player.inventory.wood >= CAMPFIRE_COST) {
    player.inventory.wood -= CAMPFIRE_COST;
    campfires.push(new Entities.Campfire(player.x, player.y));
  }
}

function activateBeacon() {
  if (beaconArmed) return;
  if (!nearShip()) return;
  const canAfford = Object.keys(RESCUE_COST).every(k => (player.inventory[k] || 0) >= RESCUE_COST[k]);
  if (canAfford) {
    Object.keys(RESCUE_COST).forEach(k => player.inventory[k] -= RESCUE_COST[k]);
    beaconArmed = true;
    hints.push('Beacon lit! Hold out until rescue arrives.');
  }
}

function sleepAtShip() {
  if (!nearShip()) return;
  timeOfDay = 10; // morning
  player.health = Math.min(100, player.health + 30);
  player.warmth = 100;
  player.energy = 100;
}

function eatFood() {
  if (player.eat()) return;
}

let running = true;
let last = performance.now();
function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function stopGame() {
  running = false;
}

function render() {
  ctx.clearRect(0, 0, width, height);
  const camera = { x: player.x - width / 2, y: player.y - height / 2 };
  const startX = Math.floor(camera.x / TILE_SIZE);
  const startY = Math.floor(camera.y / TILE_SIZE);
  const endX = Math.ceil((camera.x + width) / TILE_SIZE);
  const endY = Math.ceil((camera.y + height) / TILE_SIZE);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (x < 0 || y < 0 || x >= WORLD_SIZE || y >= WORLD_SIZE) continue;
      const tile = world.tiles[y * WORLD_SIZE + x];
      const sx = x * TILE_SIZE - camera.x;
      const sy = y * TILE_SIZE - camera.y;
      ctx.fillStyle = tileColor(tile);
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
    }
  }

  // ship safe zone
  const shipX = WORLD_SIZE * TILE_SIZE / 2 - camera.x;
  const shipY = WORLD_SIZE * TILE_SIZE / 2 - camera.y;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.arc(shipX, shipY, SHIP_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#c4d1ff';
  ctx.fillRect(shipX - 20, shipY - 12, 40, 24);
  ctx.fillStyle = '#7e8de0';
  ctx.fillRect(shipX - 16, shipY - 8, 32, 16);

  // resources
  world.resources.forEach(res => {
    if (res.collected) return;
    const rx = res.x * TILE_SIZE + TILE_SIZE / 2 - camera.x;
    const ry = res.y * TILE_SIZE + TILE_SIZE / 2 - camera.y;

    if (res.type === RESOURCE.SCRAP) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 180, 255, 0.5)';
      ctx.shadowBlur = res.highlight ? 12 : 6;
      ctx.fillStyle = '#d6f0ff';
      ctx.beginPath();
      ctx.arc(rx, ry, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a8bff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx - 4, ry);
      ctx.lineTo(rx + 4, ry);
      ctx.moveTo(rx, ry - 4);
      ctx.lineTo(rx, ry + 4);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.fillStyle = resourceColor(res.type);
    ctx.beginPath();
    ctx.arc(rx, ry, 8, 0, Math.PI * 2);
    ctx.fill();
  });

  // campfires
  campfires.forEach(f => {
    const fx = f.x - camera.x;
    const fy = f.y - camera.y;
    ctx.fillStyle = f.active ? '#ffb347' : '#444';
    ctx.beginPath();
    ctx.arc(fx, fy, 10, 0, Math.PI * 2);
    ctx.fill();
    if (f.active) {
      ctx.save();
      const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, FIRE_LIGHT_RADIUS);
      glow.addColorStop(0, 'rgba(255, 232, 180, 0.9)');
      glow.addColorStop(0.35, 'rgba(255, 200, 120, 0.65)');
      glow.addColorStop(1, 'rgba(255, 160, 64, 0.12)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fx, fy, FIRE_LIGHT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });

  // player
  const px = player.x - camera.x;
  const py = player.y - camera.y;
  ctx.fillStyle = '#82e0aa';
  ctx.beginPath();
  ctx.arc(px, py, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2ecc71';
  ctx.stroke();

  // beacon indicator
  if (beaconArmed) {
    ctx.strokeStyle = 'rgba(255,255,0,0.6)';
    ctx.beginPath();
    ctx.arc(shipX, shipY, 26 + Math.sin(performance.now() / 200) * 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // day/night tint
  const cycle = (timeOfDay / 120) * Math.PI * 2;
  const nightFactor = (Math.cos(cycle) + 1) / 2; // 0 (day) -> 1 (deep night)
  const darkness = 0.2 + nightFactor * 0.55;
  ctx.fillStyle = `rgba(6, 10, 24, ${darkness})`;
  ctx.fillRect(0, 0, width, height);

  // punch light holes around active fires (and the ship) so night rendering keeps nearby resources visible
  const lightSources = [{ x: shipX, y: shipY, radius: FIRE_LIGHT_RADIUS }];
  campfires.forEach(f => {
    if (f.active) lightSources.push({ x: f.x - camera.x, y: f.y - camera.y, radius: FIRE_LIGHT_RADIUS });
  });
  if (lightSources.length) {
    // First clear darkness inside the radius so the base scene shows through.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    lightSources.forEach(src => {
      const gradient = ctx.createRadialGradient(src.x, src.y, 0, src.x, src.y, src.radius);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
      gradient.addColorStop(0.25, 'rgba(0, 0, 0, 0.85)');
      gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(src.x, src.y, src.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Lift scene brightness inside the light cone so objects stay clear at ~75% intensity.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    lightSources.forEach(src => {
      const lift = ctx.createRadialGradient(src.x, src.y, 0, src.x, src.y, src.radius);
      lift.addColorStop(0, 'rgba(255, 245, 210, 0.75)');
      lift.addColorStop(0.35, 'rgba(255, 235, 190, 0.6)');
      lift.addColorStop(0.7, 'rgba(255, 225, 170, 0.32)');
      lift.addColorStop(1, 'rgba(255, 215, 160, 0)');
      ctx.fillStyle = lift;
      ctx.beginPath();
      ctx.arc(src.x, src.y, src.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Add a warm glow that peaks at 50% brightness and gently tapers outward.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    lightSources.forEach(src => {
      const glow = ctx.createRadialGradient(src.x, src.y, 0, src.x, src.y, src.radius);
      glow.addColorStop(0, 'rgba(255, 205, 130, 0.5)');
      glow.addColorStop(0.4, 'rgba(255, 185, 110, 0.32)');
      glow.addColorStop(1, 'rgba(255, 155, 90, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(src.x, src.y, src.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // debug HUD seed
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '13px monospace';
  ctx.fillText(`Seed ${SEED}  Day ${Math.floor(timeOfDay/120 * 4)+1}`, width - 180, 26);
}

function tileColor(tile) {
  let base;
  switch (tile) {
    case TILE.WATER: base = '#2a5d8c'; break;
    case TILE.ROCK: base = '#6c7689'; break;
    case TILE.SAND: base = '#d9caa0'; break;
    default: base = '#33513b';
  }
  return applyBrightness(base, GAMMA);
}

function resourceColor(type) {
  if (type === RESOURCE.FOOD) return '#4cd964';
  if (type === RESOURCE.WOOD) return '#9b7653';
  if (type === RESOURCE.SCRAP) return '#d6f0ff';
  return '#8fd3ff';
}

function applyBrightness(hex, gamma) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor(((bigint >> 16) & 255) * gamma));
  const g = Math.min(255, Math.floor(((bigint >> 8) & 255) * gamma));
  const b = Math.min(255, Math.floor((bigint & 255) * gamma));
  return `rgb(${r}, ${g}, ${b})`;
}

// Input handling
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
    e.preventDefault();
  }
  if (e.key === 'e' || e.key === 'E') {
    // gathering handled in update loop proximity
  }
  if (e.key === 'f' || e.key === 'F') buildCampfire();
  if (e.key === 'b' || e.key === 'B') activateBeacon();
  if (e.key === 'q' || e.key === 'Q') eatFood();
  if (e.key === 'r' || e.key === 'R') sleepAtShip();
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

window.addEventListener('blur', () => {
  keys = {};
});

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
});

// Start game
UI.hideOverlay();
requestAnimationFrame(loop);
