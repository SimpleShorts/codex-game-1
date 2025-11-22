(function() {
  const { RESOURCE } = WorldGen;

  class Player {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.speed = 520; // tuned so each frame moves ~8-10px at 60fps before fatigue
      this.energy = 100;
      this.health = 100;
      this.warmth = 100;
      this.inventory = { food: 1, wood: 2, oil: 0 };
      this.direction = { x: 0, y: 0 };
    }
    move(dx, dy, dt, collisionFn) {
      this.direction.x = dx;
      this.direction.y = dy;
      const len = Math.hypot(dx, dy) || 1;
      const moveSpeed = this.speed * (0.6 + this.energy / 200);
      const nx = dx / len * moveSpeed * dt;
      const ny = dy / len * moveSpeed * dt;
      const targetX = this.x + nx;
      const targetY = this.y + ny;
      if (!collisionFn(targetX, targetY)) {
        this.x = targetX;
        this.y = targetY;
        this.energy = Math.max(0, this.energy - 6 * dt);
      } else {
        // slow energy drain when pushing against obstacles
        this.energy = Math.max(0, this.energy - 2 * dt);
      }
    }
    rest(dt) {
      this.energy = Math.min(100, this.energy + 15 * dt);
    }
    eat() {
      if (this.inventory.food > 0) {
        this.inventory.food -= 1;
        this.health = Math.min(100, this.health + 20);
        this.warmth = Math.min(100, this.warmth + 10);
        return true;
      }
      return false;
    }
  }

  class Campfire {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.timer = 60; // seconds of burn
    }
    update(dt) {
      this.timer = Math.max(0, this.timer - dt);
    }
    get active() {
      return this.timer > 0;
    }
  }

  function collectResource(player, resource) {
    if (resource.collected) return false;
    resource.collected = true;
    player.inventory[resource.type] = (player.inventory[resource.type] || 0) + 1;
    return true;
  }

  window.Entities = { Player, Campfire, collectResource, RESOURCE };
})();
