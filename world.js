// Deterministic random helpers
(function() {
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const TILE = {
    GROUND: 0,
    WATER: 1,
    ROCK: 2,
    SAND: 3
  };

  const RESOURCE = {
    FOOD: 'food',
    WOOD: 'wood',
    OIL: 'oil',
    SCRAP: 'scrap'
  };

  function generateWorld(seed, size) {
    const rng = mulberry32(seed);
    const tiles = new Array(size * size);
    const resources = [];

    const slopeX = rng() * 0.6 - 0.3; // tilt landmass toward a random side
    const slopeY = rng() * 0.6 - 0.3;
    const noiseShiftX = Math.floor(rng() * 10000);
    const noiseShiftY = Math.floor(rng() * 10000);

    // Simple height-ish noise from layered random circles
    const peaks = [];
    for (let i = 0; i < 10; i++) {
      peaks.push({
        x: Math.floor(rng() * size),
        y: Math.floor(rng() * size),
        r: 12 + rng() * 24,
        strength: rng() * 0.6 + 0.4
      });
    }

    function valueNoise(x, y) {
      // hash-based deterministic noise to add variety without extra RNG use
      let n = x * 374761393 + y * 668265263;
      n = (n ^ (n << 13)) >>> 0;
      n = (n * (n * n * 15731 + 789221) + 1376312589) >>> 0;
      return (n & 0xfffffff) / 0xfffffff; // 0..1
    }

    const landReach = size * 0.48;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - size / 2;
        const dy = y - size / 2;
        const radial = Math.pow(Math.max(0, 1 - Math.hypot(dx, dy) / landReach), 1.2);
        let h = 0.5 + radial * 0.6; // keep a broad, walkable continent

        // add gentle continent tilt for macro variety
        h += slopeX * (x / size - 0.5) + slopeY * (y / size - 0.5);

        // add coarse deterministic noise to break symmetry
        const n = valueNoise(x + noiseShiftX, y + noiseShiftY);
        h += (n - 0.5) * 0.42;

        peaks.forEach(p => {
          const d = Math.hypot(x - p.x, y - p.y);
          h += Math.max(0, p.strength * (1 - d / p.r));
        });

        // soften immediate spawn neighborhood; broader world stays varied
        const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
        if (distanceFromCenter < size * 0.08) {
          h = Math.max(h, 0.6);
        }

        let tile;
        if (h < 0.32) tile = TILE.WATER;
        else if (h < 0.45) tile = TILE.SAND;
        else if (h > 1.15) tile = TILE.ROCK;
        else tile = TILE.GROUND;
        tiles[y * size + x] = tile;
      }
    }

    // Guarantee a walkable spawn bubble so the player isn't trapped on water/rocks.
    const spawnCenter = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
    const safeRadius = 10;
    for (let y = spawnCenter.y - safeRadius; y <= spawnCenter.y + safeRadius; y++) {
      for (let x = spawnCenter.x - safeRadius; x <= spawnCenter.x + safeRadius; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const dist = Math.hypot(x - spawnCenter.x, y - spawnCenter.y);
        if (dist <= safeRadius - 2) {
          tiles[y * size + x] = TILE.GROUND;
        } else if (dist <= safeRadius) {
          tiles[y * size + x] = TILE.SAND;
        }
      }
    }

    // scatter resources with rings outward
    const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
    function place(count, type, minDist, maxDist, forceVisible = false) {
      let placed = 0;
      const maxAttempts = count * 60;
      for (let attempt = 0; attempt < maxAttempts && placed < count; attempt++) {
        const angle = rng() * Math.PI * 2;
        const dist = minDist + rng() * (maxDist - minDist);
        const x = Math.floor(center.x + Math.cos(angle) * dist);
        const y = Math.floor(center.y + Math.sin(angle) * dist);
        if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) continue;
        const tile = tiles[y * size + x];
        if (tile === TILE.WATER || tile === TILE.ROCK) continue;
        resources.push({ x, y, type, collected: false, highlight: forceVisible });
        placed++;
      }

      // If we ran out of luck on a resource type, drop a few emergency spawns on any walkable land.
      while (placed < count) {
        for (let y = 2; y < size - 2 && placed < count; y++) {
          for (let x = 2; x < size - 2 && placed < count; x++) {
            const tile = tiles[y * size + x];
            const farEnough = Math.hypot(x - center.x, y - center.y) > minDist * 0.75;
            if (tile === TILE.WATER || tile === TILE.ROCK || !farEnough) continue;
            resources.push({ x, y, type, collected: false, highlight: forceVisible });
            placed++;
          }
        }
      }
    }

    place(Math.floor(size * 0.9), RESOURCE.FOOD, 12, size / 2.2);
    place(Math.floor(size * 1.2), RESOURCE.WOOD, 10, size / 1.8);
    place(Math.floor(size * 0.35), RESOURCE.OIL, size / 3.2, size / 1.6);
    // Scrap parts: intentionally far from spawn and never zero, with highlights to aid visibility
    place(Math.max(30, Math.floor(size * 0.55)), RESOURCE.SCRAP, size / 2.1, size * 0.46, true);

    return { tiles, resources, rng, TILE, RESOURCE };
  }

  window.WorldGen = { generateWorld, TILE, RESOURCE };
})();
