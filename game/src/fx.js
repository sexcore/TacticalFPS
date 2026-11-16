// Pooled visual effects: tracers, impact sparks, muzzle flash, explosions.
// Fixed pools, no allocation after construction, no per-frame object churn.
import * as THREE from 'three';

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    // Tracer pool: thin additive lines
    this.tracers = [];
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, tracerMat.clone());
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerIdx = 0;
    // Spark pool
    this.sparks = [];
    const sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    this.dustMat = new THREE.MeshBasicMaterial({ color: 0xffcc88 });
    this.bloodMat = new THREE.MeshBasicMaterial({ color: 0xaa2222 });
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(sparkGeo, this.dustMat);
      m.visible = false;
      scene.add(m);
      this.sparks.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1 });
    }
    this.sparkIdx = 0;
    // Muzzle flash: one sprite + one light, reused
    this.flashTex = glowTexture('rgba(255,240,200,1)', 'rgba(255,160,60,0.6)');
    this.muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.muzzleSprite.scale.set(0.55, 0.55, 1);
    this.muzzleSprite.visible = false;
    scene.add(this.muzzleSprite);
    this.muzzleLife = 0;
    this.muzzleLight = new THREE.PointLight(0xffc060, 0, 9, 1.8);
    scene.add(this.muzzleLight);
    // Explosion pool: 2 groups of 2 sprites + 1 light
    this.booms = [];
    const boomTex = glowTexture('rgba(255,220,160,1)', 'rgba(255,90,20,0.7)');
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const s1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: boomTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const s2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: boomTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 }));
      s1.scale.set(1, 1, 1);
      s2.scale.set(0.6, 0.6, 1);
      g.add(s1); g.add(s2);
      g.visible = false;
      scene.add(g);
      this.booms.push({ group: g, s1, s2, life: 0 });
    }
    this.boomIdx = 0;
    this.boomLight = new THREE.PointLight(0xff8030, 0, 26, 1.6);
    scene.add(this.boomLight);
  }

  tracer(from, to) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z;
    p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.07;
  }

  impact(pos, blood) {
    for (let n = 0; n < 4; n++) {
      const s = this.sparks[this.sparkIdx];
      this.sparkIdx = (this.sparkIdx + 1) % this.sparks.length;
      s.mesh.position.copy(pos);
      s.mesh.material = blood ? this.bloodMat : this.dustMat;
      s.vel.set((Math.random() - 0.5) * 4, Math.random() * 3.5, (Math.random() - 0.5) * 4);
      s.max = s.life = blood ? 0.35 : 0.28;
      s.mesh.visible = true;
      s.mesh.scale.set(1, 1, 1);
    }
  }

  muzzle(pos) {
    this.muzzleSprite.position.copy(pos);
    this.muzzleSprite.material.rotation = Math.random() * Math.PI;
    this.muzzleSprite.visible = true;
    this.muzzleLife = 0.05;
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.intensity = 9;
  }

  explosion(pos) {
    const b = this.booms[this.boomIdx];
    this.boomIdx = (this.boomIdx + 1) % this.booms.length;
    b.group.position.copy(pos);
    b.group.visible = true;
    b.life = 0.55;
    this.boomLight.position.copy(pos);
    this.boomLight.position.y += 1;
    this.boomLight.intensity = 90;
    for (let n = 0; n < 8; n++) {
      const s = this.sparks[this.sparkIdx];
      this.sparkIdx = (this.sparkIdx + 1) % this.sparks.length;
      s.mesh.position.copy(pos);
      s.mesh.material = this.dustMat;
      s.vel.set((Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9);
      s.max = s.life = 0.5;
      s.mesh.visible = true;
      s.mesh.scale.set(1.6, 1.6, 1.6);
    }
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
      else t.line.material.opacity = (t.life / 0.07) * 0.9;
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.vel.y -= 12 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.mesh.position.y < 0.03) { s.mesh.position.y = 0.03; s.vel.y = 0; }
      const k = s.life / s.max;
      s.mesh.scale.set(k, k, k);
    }
    if (this.muzzleLife > 0) {
      this.muzzleLife -= dt;
      if (this.muzzleLife <= 0) this.muzzleSprite.visible = false;
    }
    if (this.muzzleLight.intensity > 0) this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 160);
    for (const b of this.booms) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.group.visible = false; continue; }
      const k = 1 - b.life / 0.55;
      const sc = 1 + k * 6;
      b.s1.scale.set(sc, sc, 1);
      b.s2.scale.set(sc * 0.6, sc * 0.6, 1);
      b.s1.material.opacity = 1 - k;
      b.s2.material.opacity = (1 - k) * 0.7;
    }
    if (this.boomLight.intensity > 0) this.boomLight.intensity = Math.max(0, this.boomLight.intensity - dt * 260);
  }
}
