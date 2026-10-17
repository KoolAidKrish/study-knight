// Pixel-art scene: the character runs through the focus background while you study
// and rests by a campfire in the break background. Both, and the character, come from packs.

const H = 320;                 // logical height; width follows the window's aspect
const RUN_SPEED = 62;          // foreground px/s
const HERO_X = 0.56;           // fraction of width, clear of the HUD

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'idle';        // 'idle' | 'study' | 'paused' | 'camp' | 'done'
    this.skyProgress = 0;      // 0 = start of plan … 1 = all focus done
    this.scroll = 0;
    this.time = 0;
    this.anim = 'idle';
    this.animT = 0;
    this.nextJump = 25;
    this.fade = 0;             // 0..1 black overlay used for scene swaps
    this.fadeDir = 0;
    this.pendingScene = null;
    this.scene = 'trail';      // 'trail' | 'camp'
    this.sparks = [];
    this.hero = null;
    this.bgs = { trail: null, camp: null };
    this.phase = { trail: 0, camp: 0 };   // index, or 'cycle' to follow skyProgress
    this.last = performance.now();
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame((t) => this.frame(t));
  }

  setHero(hero) {
    this.hero = hero;
    this.anim = 'idle';
    this.animT = 0;
  }

  // which: 'trail' (focus) or 'camp' (break)
  setBackground(which, bg, phase) {
    this.bgs[which] = bg;
    this.phase[which] = phase === 'cycle' && bg.phases.length > 1 ? 'cycle' : Math.min(+phase || 0, bg.phases.length - 1);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const aspect = Math.max(1.1, r.width / Math.max(1, r.height));
    this.canvas.height = H;
    this.canvas.width = Math.round(H * aspect);
    this.ctx.imageSmoothingEnabled = false;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    const wantScene = mode === 'camp' ? 'camp' : 'trail';
    this.mode = mode;
    if (wantScene !== this.scene) {
      this.pendingScene = wantScene;
      this.fadeDir = 1;
    }
    if (mode !== 'study') this.anim = 'idle';
  }

  setSkyProgress(p) {
    this.skyProgress = Math.min(1, Math.max(0, p));
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    if (this.hero && this.bgs.trail && this.bgs.camp) this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    this.time += dt;
    this.animT += dt * 1000;

    if (this.fadeDir) {
      this.fade += this.fadeDir * dt * 2.4;
      if (this.fade >= 1) {
        this.fade = 1;
        this.scene = this.pendingScene;
        this.fadeDir = -1;
      } else if (this.fade <= 0) {
        this.fade = 0;
        this.fadeDir = 0;
      }
    }

    const running = this.mode === 'study' && this.scene === 'trail';
    if (running) {
      this.scroll += RUN_SPEED * dt;
      if (this.anim === 'idle') this.setAnim('run');
      this.nextJump -= dt;
      if (this.nextJump <= 0 && this.anim === 'run') {
        if (this.hero?.anims.jump) this.setAnim('jump');
        this.nextJump = 20 + Math.random() * 45;
      }
      const a = this.hero?.anims[this.anim];
      if (this.anim === 'jump' && a && this.animT >= a.frames * a.ms) this.setAnim('run');
    } else if (this.anim !== 'idle') {
      this.setAnim('idle');
    }

    if (this.scene === 'camp') this.updateSparks(dt);
  }

  setAnim(name) {
    this.anim = name;
    this.animT = 0;
  }

  // ---------- drawing ----------

  draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, H);
    const bg = this.bgs[this.scene];
    this.drawBackground(ctx, this.scene);

    const cx = Math.round(canvas.width * HERO_X);
    if (this.scene === 'camp') {
      if (bg.ledge) this.drawOutcrop(cx - 90, cx + 130, bg.ground);
      const fireX = cx + 46;
      this.drawGlow(fireX, bg.ground - 8);
      this.drawHero(cx, bg.ground);
      this.drawFire(fireX, bg.ground);
      this.drawSparks();
    } else {
      if (bg.ledge) this.drawPath(bg.ground);
      this.drawHero(cx, bg.ground);
    }

    if (this.fade > 0) {
      ctx.fillStyle = `rgba(10, 10, 24, ${this.fade})`;
      ctx.fillRect(0, 0, canvas.width, H);
    }
  }

  tile(ctx, img, offset, y, scale) {
    const w = img.width * scale;
    const h = img.height * scale;
    let x = -(((offset % w) + w) % w);
    for (; x < this.canvas.width; x += w) ctx.drawImage(img, Math.round(x), Math.round(y), w, h);
  }

  drawPhase(ctx, bg, i) {
    for (const l of bg.phases[i].layers) {
      this.tile(ctx, l.img, this.scroll * l.parallax + this.time * l.drift, -bg.cropY, bg.scale);
    }
  }

  drawBackground(ctx, which) {
    const bg = this.bgs[which];
    const phase = this.phase[which];
    if (phase !== 'cycle') return this.drawPhase(ctx, bg, phase);

    // Walk through the phases over the plan, holding each and cross-fading near the end of each leg.
    const n = bg.phases.length;
    const x = this.skyProgress * (n - 1);
    const i = Math.min(n - 2, Math.floor(x));
    const blend = smoothstep(0.72, 1, x - i);
    if (blend < 1) this.drawPhase(ctx, bg, i);
    if (blend > 0) {
      // Fade the next phase in as a whole picture, so the old sun can't peek through the new sky.
      const off = this.buffer ??= document.createElement('canvas');
      if (off.width !== this.canvas.width) { off.width = this.canvas.width; off.height = H; }
      const octx = off.getContext('2d');
      octx.imageSmoothingEnabled = false;
      octx.clearRect(0, 0, off.width, H);
      this.drawPhase(octx, bg, i + 1);
      ctx.globalAlpha = blend;
      ctx.drawImage(off, 0, 0);
      ctx.globalAlpha = 1;
    }
  }

  // Stone outcrop rising out of a cloud sea (for backgrounds with no ground), built from 2px steps.
  drawOutcrop(x0, x1, top) {
    const { ctx } = this;
    for (let x = x0; x < x1; x += 2) {
      const edge = Math.min(x - x0, x1 - x);
      const lift = Math.min(10, Math.floor(edge / 6) * 2);
      const y = top + 10 - lift;
      ctx.fillStyle = '#3d4466';
      ctx.fillRect(x, y, 2, H - y);
      ctx.fillStyle = '#5c6790';
      ctx.fillRect(x, y, 2, 2);
      if (lift >= 10) {
        ctx.fillStyle = '#e8f0ff';
        ctx.fillRect(x, y - 2, 2, 2);
      }
    }
    ctx.fillStyle = '#2c3150';
    for (let x = x0 + 12; x < x1 - 12; x += 22) ctx.fillRect(x, top + 8, 6, 2);
  }

  // The same stone as a continuous, scrolling ridge path for running on.
  drawPath(top) {
    const { ctx } = this;
    const w = this.canvas.width;
    ctx.fillStyle = '#3d4466';
    ctx.fillRect(0, top, w, H - top);
    ctx.fillStyle = '#5c6790';
    ctx.fillRect(0, top, w, 2);
    ctx.fillStyle = '#e8f0ff';
    const s = Math.round(this.scroll);
    for (let x = -(s % 34); x < w; x += 34) ctx.fillRect(x, top - 2, 14, 2);
    ctx.fillStyle = '#2c3150';
    for (let x = -(s % 22); x < w; x += 22) ctx.fillRect(x, top + 6, 6, 2);
  }

  drawGlow(x, y) {
    const { ctx } = this;
    const flick = 0.85 + 0.15 * Math.sin(this.time * 9) * Math.sin(this.time * 3.3);
    const g = ctx.createRadialGradient(x, y, 2, x, y, 90 * flick);
    g.addColorStop(0, 'rgba(255, 170, 80, 0.35)');
    g.addColorStop(1, 'rgba(255, 140, 60, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 100, y - 100, 200, 200);
  }

  drawFire(x, ground) {
    const { ctx } = this;
    const P = 2;
    // logs
    ctx.fillStyle = '#5a3a2a';
    ctx.fillRect(x - 10, ground - 4, 20, 4);
    ctx.fillStyle = '#7a5038';
    ctx.fillRect(x - 8, ground - 6, 16, 2);
    // flames: columns whose heights flicker
    const cols = [-3, -2, -1, 0, 1, 2, 3];
    const t = this.time;
    for (const c of cols) {
      const base = 7 - Math.abs(c) * 1.6;
      const h = Math.max(1, Math.round(base + Math.sin(t * 11 + c * 1.7) * 1.4 + Math.sin(t * 6.1 + c) * 0.8));
      for (let k = 0; k < h; k++) {
        const r = k / h;
        ctx.fillStyle = r < 0.35 ? '#fff1a8' : r < 0.7 ? '#ffb347' : '#e8553b';
        if (Math.abs(c) >= 2 && r < 0.35) ctx.fillStyle = '#ffb347';
        ctx.fillRect(x + c * P - 1, ground - 6 - (k + 1) * P, P, P);
      }
    }
  }

  updateSparks(dt) {
    const ground = this.bgs.camp?.ground ?? 300;
    if (Math.random() < dt * 6) {
      this.sparks.push({
        x: this.canvas.width * HERO_X + 46 + (Math.random() - 0.5) * 8,
        y: ground - 16,
        vx: (Math.random() - 0.5) * 10,
        vy: -18 - Math.random() * 18,
        life: 1 + Math.random() * 0.8,
      });
    }
    for (const s of this.sparks) {
      s.x += s.vx * dt + Math.sin(this.time * 4 + s.y * 0.1) * 0.2;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  drawSparks() {
    const { ctx } = this;
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.min(1, s.life);
      ctx.fillStyle = s.life > 0.6 ? '#ffd27a' : '#ff8a4c';
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  drawHero(x, ground) {
    const hero = this.hero;
    const a = hero.anims[this.anim] ?? hero.anims.idle;
    let frame = Math.floor(this.animT / a.ms) % a.frames;
    let lift = 0;
    if (this.anim === 'jump') {
      frame = Math.min(a.frames - 1, Math.floor(this.animT / a.ms));
      // airborne over the pack's "air" frames (or the middle half of the jump)
      const [s, e] = a.air ?? [a.frames * 0.25, a.frames * 0.75];
      const t = (this.animT / a.ms - s) / (e - s);
      if (t > 0 && t < 1) lift = Math.round(Math.sin(Math.PI * t) * 26);
    }
    drawSprite(this.ctx, hero, a, frame, x, ground, lift, true);
  }
}

// Shared with the Scenery previews.
export function drawSprite(ctx, hero, a, frame, x, ground, lift = 0, shadow = false) {
  const s = hero.scale;
  const w = a.w * s;
  const h = a.h * s;
  if (shadow) {
    const sw = Math.max(10, Math.round(w * 0.55)) - Math.round(lift / 3);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.22 - lift * 0.005})`;
    ctx.fillRect(Math.round(x - sw / 2), ground - 2, sw, 2);
  }
  const sx = a.vertical ? 0 : frame * a.w;
  const sy = a.vertical ? frame * a.h : 0;
  const dy = ground - h - lift + hero.feet * s;
  if (hero.flip) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(a.img, sx, sy, a.w, a.h, -Math.round(x + w / 2), dy, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(a.img, sx, sy, a.w, a.h, Math.round(x - w / 2), dy, w, h);
  }
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
