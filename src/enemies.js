// Little enemies that wander onto the trail while you focus. The hero always wins: ambience, not stakes.
// Sprites: Kenney "Pixel Platformer" (CC0), 24×24 cells. The last frame of a walker is its squashed pose.

import { loadImage } from './packs.js';

const TYPES = [
  { id: 'beetle', frames: 2, squash: 2, speed: 18, ms: 160, weight: 3 },
  { id: 'spike', frames: 2, squash: 2, speed: 14, ms: 200, weight: 2 },
  { id: 'big-beetle', frames: 2, squash: 2, speed: 10, ms: 220, weight: 1 },
  { id: 'hopper', frames: 2, hop: 14, speed: 22, ms: 180, weight: 2, feet: 4 },
  { id: 'bat', frames: 3, fly: 34, speed: 26, ms: 110, weight: 2, feet: 3 },
];
const SCALE = 2;
const CELL = 24;

export class Enemies {
  constructor() {
    this.list = [];
    this.puffs = [];
    this.next = 12 + Math.random() * 10;   // first one shows up soon after you start
  }

  async load() {
    for (const t of TYPES) t.img = await loadImage(`assets/enemies/${t.id}.png`);
  }

  clear() {
    this.list = [];
    this.puffs = [];
  }

  // Called only while the hero is running the trail.
  spawn(width, time) {
    const total = TYPES.reduce((a, t) => a + t.weight, 0);
    let r = Math.random() * total;
    const type = TYPES.find((t) => (r -= t.weight) < 0) ?? TYPES[0];
    this.list.push({ type, x: width + 30, born: time, state: 'walk', deadT: 0 });
    this.next = 30 + Math.random() * 50;
  }

  // The nearest living enemy, for the hero to aim at.
  target(heroX) {
    return this.list.find((e) => e.state === 'walk' && e.x > heroX - 4);
  }

  kill(e) {
    e.state = 'dead';
    e.deadT = 0;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.puffs.push({ x: e.x, y: e.y - 10, vx: Math.cos(a) * 40, vy: Math.sin(a) * 30 - 10, life: 0.45 });
    }
  }

  update(dt, { running, scrollSpeed, heroX, width }) {
    if (running) {
      this.next -= dt;
      if (this.next <= 0) this.spawn(width, performance.now() / 1000);
    }
    for (const e of this.list) {
      if (e.state === 'walk') {
        if (!running) continue;               // the world holds still while paused
        e.x -= (scrollSpeed + e.type.speed) * dt;
        e.x = Math.max(e.x, heroX + 34);      // stop just short of the hero and wait for the blow
      } else {
        e.deadT += dt;
        if (running) e.x -= scrollSpeed * dt; // the squashed body scrolls away with the ground
      }
    }
    this.list = this.list.filter((e) => e.x > -40 && !(e.state === 'dead' && e.deadT > 0.7));
    for (const p of this.puffs) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.life -= dt;
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
  }

  draw(ctx, ground, time) {
    for (const e of this.list) {
      const t = e.type;
      let frame = Math.floor((time * 1000) / t.ms) % t.frames;
      let lift = 0;
      if (t.fly) lift = t.fly + Math.round(Math.sin(time * 3 + e.born) * 6);
      else if (t.hop && e.state === 'walk') lift = Math.round(Math.abs(Math.sin(time * 5 + e.born)) * t.hop);
      if (e.state === 'dead') {
        frame = t.squash ?? frame;
        if (!t.squash) lift = Math.max(0, lift - e.deadT * 120);
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, e.deadT - 0.35) / 0.35);
      }
      const s = CELL * SCALE;
      e.y = ground - lift;
      if (!t.fly) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(Math.round(e.x - 10), ground - 2, 20, 2);
      }
      ctx.drawImage(t.img, frame * CELL, 0, CELL, CELL, Math.round(e.x - s / 2), Math.round(ground - s + (t.feet ?? 0) * SCALE - lift), s, s);
      ctx.globalAlpha = 1;
    }
    for (const p of this.puffs) {
      ctx.globalAlpha = Math.min(1, p.life * 3);
      ctx.fillStyle = p.life > 0.25 ? '#ffffff' : '#d8d4e8';
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
    }
    ctx.globalAlpha = 1;
  }
}
