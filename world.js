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
    OIL: 'oil'
  };

  function generateWorld(seed, size) {
    const rng = mulberry32(seed);
    const tiles = new Array(size * size);
    const resources = [];

    // Simple height-ish noise from layered random circles
    const peaks = [];
    for (let i = 0; i < 8; i++) {
      peaks.push({
        x: Math.floor(rng() * size),
        y: Math.floor(rng() * size),
        r: 12 + rng() * 24,
        strength: rng() * 0.6 + 0.4
      });
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - size / 2;
        const dy = y - size / 2;
        const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
        let h = 0.4; // base height
        peaks.forEach(p => {
          const d = Math.hypot(x - p.x, y - p.y);
          h += Math.max(0, p.strength * (1 - d / p.r));
        });
        // soften around center to keep crash site calm
        h -= Math.max(0, 0.6 - distanceFromCenter / (size * 0.15));
        let tile;
        if (h < 0.35) tile = TILE.WATER;
        else if (h < 0.45) tile = TILE.SAND;
        else if (h > 1.05) tile = TILE.ROCK;
        else tile = TILE.GROUND;
        tiles[y * size + x] = tile;
      }
    }

    // scatter resources with rings outward
    const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
    function place(count, type, minDist, maxDist) {
      for (let i = 0; i < count; i++) {
        for (let tries = 0; tries < 30; tries++) {
          const angle = rng() * Math.PI * 2;
          const dist = minDist + rng() * (maxDist - minDist);
          const x = Math.floor(center.x + Math.cos(angle) * dist);
          const y = Math.floor(center.y + Math.sin(angle) * dist);
          if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) continue;
          const tile = tiles[y * size + x];
          if (tile === TILE.WATER || tile === TILE.ROCK) continue;
          resources.push({ x, y, type, collected: false });
          break;
        }
      }
    }

    place(Math.floor(size * 0.9), RESOURCE.FOOD, 12, size / 2.2);
    place(Math.floor(size * 1.2), RESOURCE.WOOD, 10, size / 1.8);
    place(Math.floor(size * 0.35), RESOURCE.OIL, size / 3, size / 1.4);

    return { tiles, resources, rng, TILE, RESOURCE };
  }

  window.WorldGen = { generateWorld, TILE, RESOURCE };
})();
