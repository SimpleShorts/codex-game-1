(function() {
  function updateHUD(player, hints, info = {}) {
    const healthBar = document.getElementById('healthBar');
    const tempBar = document.getElementById('tempBar');
    const inventory = document.getElementById('inventory');
    const messages = document.getElementById('messages');
    const seedDisplay = document.getElementById('seedDisplay');
    const controls = document.getElementById('controls');

    healthBar.style.width = player.health + '%';
    tempBar.style.width = player.warmth + '%';
    document.getElementById('healthLabel').textContent = 'Health ' + Math.round(player.health);
    document.getElementById('tempLabel').textContent = 'Warmth ' + Math.round(player.warmth);

    inventory.innerHTML = `
      Food: <strong>${player.inventory.food || 0}</strong> |
      Wood: <strong>${player.inventory.wood || 0}</strong> |
      Oil: <strong>${player.inventory.oil || 0}</strong> |
      Scrap: <strong>${player.inventory.scrap || 0}</strong>
    `;

    messages.innerHTML = hints.map(h => `<div class="hint">${h}</div>`).join('');

    if (seedDisplay) {
      const dayLabel = info.day ? ` · Day ${info.day}` : '';
      seedDisplay.textContent = `Seed ${info.seed ?? '???'}${dayLabel}  (Set via ?seed=NUMBER)`;
    }

    if (controls) {
      controls.textContent = 'Move: WASD / Arrows · Gather: E · Eat: Q · Fire: F · Rest: R · Beacon: B';
    }

    const beaconCost = document.getElementById('beaconCost');
    if (beaconCost && info.beaconCost) {
      const oil = info.beaconCost.oil ?? 0;
      const scrap = info.beaconCost.scrap ?? 0;
      beaconCost.textContent = `Beacon needs ${oil} Oil + ${scrap} Scrap Parts`;
    }
  }

  function showOverlay(text) {
    const overlay = document.getElementById('overlay');
    overlay.textContent = text;
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    document.getElementById('overlay').classList.add('hidden');
  }

  window.UI = { updateHUD, showOverlay, hideOverlay };
})();
