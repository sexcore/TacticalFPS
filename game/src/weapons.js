// Weapons: hitscan fire, spread and recoil, reloads, grenades, damage.
// Shared by the player and the bots — one damage path for every shooter.
// W is the world context { cols, fx, audio } built by main.js.
import * as THREE from 'three';
import { CFG, WEAPONS, GRENADES, ARMOR_PRICE, KIT_PRICE } from './config.js';
import { pushFeed } from './state.js';
import { rayWorld, moveBody, losClear } from './collide.js';
import { clamp, DEG } from './math.js';

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _from = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _mzl = new THREE.Vector3();

export function eyeHeight(a) { return a.crouch ? CFG.eyeCrouch : CFG.eyeStand; }
export function bodyHeight(a) { return a.crouch ? CFG.bodyCrouch : CFG.bodyHeight; }

export function eyePos(a, out) {
  out.set(a.pos.x, a.pos.y + eyeHeight(a), a.pos.z);
  return out;
}

/** Forward vector from yaw/pitch. yaw 0 faces -Z, pitch positive looks up. */
export function aimDir(a, out) {
  const cp = Math.cos(a.pitch);
  out.set(-Math.sin(a.yaw) * cp, Math.sin(a.pitch), -Math.cos(a.yaw) * cp);
  return out;
}

function rightOf(a, out) {
  out.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
  return out;
}

/** Slab test against one agent body box. Returns t or Infinity. No allocation. */
function rayAgent(ox, oy, oz, dx, dy, dz, maxD, a) {
  const h = bodyHeight(a);
  let tmin = 0, tmax = maxD;
  // X axis
  let mn = a.pos.x - CFG.bodyHalf, mx = a.pos.x + CFG.bodyHalf;
  if (dx === 0) { if (ox < mn || ox > mx) return Infinity; }
  else {
    let t1 = (mn - ox) / dx, t2 = (mx - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Y axis
  mn = a.pos.y; mx = a.pos.y + h;
  if (dy === 0) { if (oy < mn || oy > mx) return Infinity; }
  else {
    let t1 = (mn - oy) / dy, t2 = (mx - oy) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Z axis
  mn = a.pos.z - CFG.bodyHalf; mx = a.pos.z + CFG.bodyHalf;
  if (dz === 0) { if (oz < mn || oz > mx) return Infinity; }
  else {
    let t1 = (mn - oz) / dz, t2 = (mx - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

function isHeadHit(a, hy) {
  return hy > a.pos.y + bodyHeight(a) - CFG.headSize;
}

export function fireWeapon(S, W, a, dir) {
  const w = WEAPONS[a.weapon];
  if (a.mag[a.weapon] <= 0) {
    W.audio.play('dry', a);
    startReload(S, W, a);
    return false;
  }
  const speed = Math.hypot(a.vel.x, a.vel.z);
  const moveF = clamp(speed / CFG.walkSpeed, 0, 1);
  let spread = w.spreadBase + w.spreadMove * moveF + a.bloom;
  if (!a.onGround) spread += w.spreadAir;
  if (a.crouch) spread *= 0.7;
  if (a.zoomed) spread *= 0.3;
  eyePos(a, _from);
  _dir.copy(dir);
  // Random cone: perturb around the aim direction.
  rightOf(a, _right);
  _up.crossVectors(_right, _dir).normalize();
  const ang = spread * DEG * (0.35 + Math.random() * 0.65);
  const rot = Math.random() * Math.PI * 2;
  const off = Math.tan(ang);
  _dir.x += (_right.x * Math.cos(rot) + _up.x * Math.sin(rot)) * off;
  _dir.y += (_right.y * Math.cos(rot) + _up.y * Math.sin(rot)) * off;
  _dir.z += (_right.z * Math.cos(rot) + _up.z * Math.sin(rot)) * off;
  _dir.normalize();

  const wallD = rayWorld(W.cols, _from.x, _from.y, _from.z, _dir.x, _dir.y, _dir.z, w.range);
  let bestD = wallD, victim = null;
  for (const t of S.agents) {
    if (t === a || !t.alive || t.team === a.team) continue;
    const d = rayAgent(_from.x, _from.y, _from.z, _dir.x, _dir.y, _dir.z, Math.min(wallD, w.range), t);
    if (d < bestD) { bestD = d; victim = t; }
  }
  _hit.copy(_from).addScaledVector(_dir, bestD === Infinity ? w.range : bestD);
  // Muzzle + tracer + impact
  _mzl.copy(_from).addScaledVector(_dir, 0.7);
  _mzl.y -= 0.12;
  W.fx.tracer(_mzl, _hit);
  W.fx.muzzle(_mzl);
  if (victim) {
    const head = isHeadHit(victim, _hit.y);
    const fall = 1 - (1 - w.falloff) * clamp(bestD / w.range, 0, 1);
    let dmg = w.damage * fall * (head ? w.headMult : 1);
    if (victim.armor > 0) dmg *= 0.55;
    damageAgent(S, W, victim, dmg, a, head, _hit);
    W.fx.impact(_hit, true);
    if (a.isPlayer) { S.stats.hits++; if (head) S.stats.headshots++; }
  } else if (bestD < w.range) {
    W.fx.impact(_hit, false);
  }
  a.mag[a.weapon]--;
  a.fireT = 60 / w.rpm;
  a.bloom = Math.min(w.bloomMax, a.bloom + w.bloom);
  a.recoilP += w.recoilPitch * (0.8 + Math.random() * 0.4);
  a.recoilY += (Math.random() - 0.5) * 2 * w.recoilYaw;
  if (a.isPlayer) S.stats.shots++;
  W.audio.playAt('shot_' + a.weapon, a.pos, 1);
  S.noises.push({ x: a.pos.x, y: a.pos.y, z: a.pos.z, team: a.team, t: S.time, r: CFG.hearShot, who: a });
  return true;
}

export function damageAgent(S, W, target, dmg, attacker, head, hitPos) {
  if (!target.alive) return;
  if (attacker && attacker !== target) {
    attacker.damage += dmg;
    // Assist candidate: the previous distinct attacker, if still recent.
    if (target.lastAttacker && target.lastAttacker !== attacker) {
      target.assistCand = target.lastAttacker;
      target.assistT = S.time;
    }
  }
  target.hp -= dmg;
  target.hurtT = 0.25;
  target.lastAttacker = attacker;
  if (attacker && attacker.isPlayer) {
    S.hitmark = 0.14;
    S.hitHead = !!head;
    W.audio.play(head ? 'headshot' : 'hitmark', null);
  }
  if (target.isPlayer) {
    S.damageFlash = 0.6;
    const dx = target.pos.x - (attacker ? attacker.pos.x : target.pos.x);
    const dz = target.pos.z - (attacker ? attacker.pos.z : target.pos.z);
    S.damageDir = Math.atan2(dx, dz);
    W.audio.play('hurt', null);
  }
  if (target.hp <= 0) killAgent(S, W, target, attacker, head);
}

export function killAgent(S, W, target, attacker, head) {
  target.alive = false;
  target.hp = 0;
  target.deaths++;
  target.deadT = 0;
  target.channel = null;
  if (attacker && attacker !== target) {
    attacker.kills++;
    if (head) attacker.hsKills++;
    if (attacker.isPlayer) attacker.money = Math.min(16000, attacker.money + CFG.killMoney);
    if (target.assistCand && target.assistCand !== attacker && S.time - target.assistT < 8) {
      target.assistCand.assists++;
    }
  }
  target.assistCand = null;
  if (target.bombCarrier) {
    target.bombCarrier = false;
    S.bomb.state = 'dropped';
    S.bomb.carrier = null;
    S.bomb.pos.copy(target.pos);
    S.bomb.pos.y = 0.15;
  }
  const names = attacker && attacker !== target ? `${attacker.name} ▸ ${target.name}` : target.name;
  pushFeed(S, names + (head ? '  ◉' : ''), attacker && attacker.team === 'G' ? 'g' : 's');
  W.audio.playAt('death', target.pos, 0.7);
}

export function startReload(S, W, a) {
  const w = WEAPONS[a.weapon];
  if (a.reloadT > 0 || a.mag[a.weapon] >= w.mag || a.reserve[a.weapon] <= 0) return;
  a.reloadT = w.reload;
  W.audio.play('reload', a);
}

export function updateReload(S, a, dt) {
  if (a.reloadT <= 0) return;
  a.reloadT -= dt;
  if (a.reloadT <= 0) {
    const w = WEAPONS[a.weapon];
    const need = w.mag - a.mag[a.weapon];
    const take = Math.min(need, a.reserve[a.weapon]);
    a.mag[a.weapon] += take;
    a.reserve[a.weapon] -= take;
  }
}

/** Per-agent timer decay shared by the player and the bots. */
export function tickAgent(S, a, dt) {
  if (a.fireT > 0) a.fireT -= dt;
  if (a.hurtT > 0) a.hurtT -= dt;
  if (a.blindT > 0) a.blindT -= dt;
  if (a.bloom > 0) a.bloom = Math.max(0, a.bloom - dt * 2.2);
  const rc = Math.exp(-dt * 5);
  a.recoilP *= rc;
  a.recoilY *= rc;
  updateReload(S, a, dt);
}

export function switchWeapon(S, W, a, id) {
  if (a.weapon === id || a.reloadT > 0) return;
  if (id !== a.primary && id !== a.secondary) return;
  a.weapon = id;
  a.fireT = Math.max(a.fireT, 0.28);
  a.bloom = 0;
  W.audio.play('switch', a);
}

// ---------------------------------------------------------------- grenades

export function initGrenades(S) {
  for (let i = 0; i < 8; i++) {
    S.grenades.push({ active: false, kind: 'frag', pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0, owner: null, mesh: null });
  }
  for (let i = 0; i < 4; i++) {
    S.smokes.push({ active: false, x: 0, y: 0, z: 0, r: 0, t: 0 });
  }
}

export function throwGrenade(S, W, a, dir, kind) {
  kind = kind || a.nadeSel;
  const g0 = GRENADES[kind];
  if (!g0 || a.nade[kind] <= 0 || a.fireT > 0) return false;
  for (const g of S.grenades) {
    if (g.active) continue;
    eyePos(a, g.pos);
    g.vel.copy(dir).multiplyScalar(g0.throwSpeed);
    g.vel.y += g0.upSpeed;
    g.vel.addScaledVector(a.vel, 0.5);
    g.fuse = g0.fuse;
    g.kind = kind;
    g.owner = a;
    g.active = true;
    a.nade[kind]--;
    a.fireT = 0.5;
    W.audio.play('throw', a);
    return true;
  }
  return false;
}

/** True when the segment between two points crosses an active smoke cloud. */
export function smokeBlocks(S, ax, ay, az, bx, by, bz) {
  for (const s of S.smokes) {
    if (!s.active) continue;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let t = len2 > 0 ? ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t - s.x, cy = ay + dy * t - s.y, cz = az + dz * t - s.z;
    if (cx * cx + cy * cy + cz * cz < s.r * s.r) return true;
  }
  return false;
}

function detonateFlash(S, W, pos) {
  W.fx.flash(pos);
  W.audio.playAt('flash', pos, 1.2);
  S.noises.push({ x: pos.x, y: pos.y, z: pos.z, team: 'G', t: S.time, r: 40, who: null });
  const g0 = GRENADES.flash;
  for (const a of S.agents) {
    if (!a.alive) continue;
    eyePos(a, _from);
    const dx = pos.x - _from.x, dy = pos.y - _from.y, dz = pos.z - _from.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > g0.radius) continue;
    if (!losClear(W.cols, pos.x, pos.y, pos.z, _from.x, _from.y, _from.z)) continue;
    // Facing check: the flash must be roughly in front of the agent.
    const cp = Math.cos(a.pitch);
    const fx = -Math.sin(a.yaw) * cp, fy = Math.sin(a.pitch), fz = -Math.cos(a.yaw) * cp;
    const facing = d > 0.01 ? (fx * dx + fy * dy + fz * dz) / d : 1;
    if (facing < -0.2) continue;
    const blind = Math.max(0.4, g0.blindTime * (1 - 0.6 * (d / g0.radius)));
    a.blindT = Math.max(a.blindT, blind);
    if (a.isPlayer) S.flashT = Math.max(S.flashT, blind);
  }
}

function detonateSmoke(S, W, pos) {
  const g0 = GRENADES.smoke;
  for (const s of S.smokes) {
    if (s.active) continue;
    s.active = true;
    s.x = pos.x; s.y = Math.max(0.8, pos.y); s.z = pos.z;
    s.r = g0.radius; s.t = g0.duration;
    break;
  }
  W.fx.smoke(pos, g0.radius, g0.duration);
  W.audio.playAt('smoke', pos, 0.8);
}

export function updateSmokes(S, dt) {
  for (const s of S.smokes) {
    if (!s.active) continue;
    s.t -= dt;
    if (s.t <= 0) s.active = false;
  }
}

export function updateGrenades(S, W, dt) {
  for (const g of S.grenades) {
    if (!g.active) continue;
    const g0 = GRENADES[g.kind];
    g.fuse -= dt;
    g.vel.y -= CFG.gravity * dt;
    const px = g.vel.x, py = g.vel.y, pz = g.vel.z;
    const ground = moveBody(W.cols, g.pos, g.vel, dt, 0.12, 0.24);
    if (g.vel.x === 0 && px !== 0) g.vel.x = -px * g0.bounce;
    if (g.vel.z === 0 && pz !== 0) g.vel.z = -pz * g0.bounce;
    if (g.vel.y === 0 && py < -1.5) {
      g.vel.y = -py * g0.bounce;
      W.audio.playAt('bounce', g.pos, 0.4);
    }
    if (ground) {
      g.vel.x *= Math.max(0, 1 - 3 * dt);
      g.vel.z *= Math.max(0, 1 - 3 * dt);
    }
    if (g.fuse <= 0) {
      g.active = false;
      if (g.kind === 'flash') detonateFlash(S, W, g.pos);
      else if (g.kind === 'smoke') detonateSmoke(S, W, g.pos);
      else explodeAt(S, W, g.pos, g0.radius, g0.damage, g.owner);
    }
  }
}

/** One explosion path for grenades and the planted charge. */
export function explodeAt(S, W, pos, radius, damage, owner) {
  W.fx.explosion(pos);
  W.audio.playAt('explode', pos, 1.4);
  S.shake = Math.min(1, S.shake + 0.7);
  S.noises.push({ x: pos.x, y: pos.y, z: pos.z, team: owner ? owner.team : 'G', t: S.time, r: 40, who: owner || null });
  for (const t of S.agents) {
    if (!t.alive) continue;
    const dx = t.pos.x - pos.x, dy = (t.pos.y + 0.9) - pos.y, dz = t.pos.z - pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > radius) continue;
    if (!losClear(W.cols, pos.x, pos.y + 0.2, pos.z, t.pos.x, t.pos.y + 1.1, t.pos.z)) continue;
    const dmg = damage * (1 - (d / radius) * 0.72);
    _hit.set(t.pos.x, t.pos.y + 1, t.pos.z);
    damageAgent(S, W, t, dmg, owner, false, _hit);
  }
}

// ---------------------------------------------------------------- buying

export function buyWeapon(S, W, a, id) {
  const w = WEAPONS[id];
  if (!w || a.money < w.price) return false;
  if (w.slot === 1 && a.primary === id) return false;
  a.money -= w.price;
  if (w.slot === 1) a.primary = id; else a.secondary = id;
  a.mag[id] = w.mag;
  a.reserve[id] = w.reserve;
  a.weapon = id;
  W.audio.play('buy', null);
  return true;
}

export function buyArmor(S, W, a) {
  if (a.armor > 0 || a.money < ARMOR_PRICE) return false;
  a.money -= ARMOR_PRICE;
  a.armor = 100;
  W.audio.play('buy', null);
  return true;
}

export function buyGrenade(S, W, a, kind) {
  const g0 = GRENADES[kind || 'frag'];
  if (!g0 || a.nade[kind || 'frag'] >= g0.maxCarry || a.money < g0.price) return false;
  a.money -= g0.price;
  a.nade[kind || 'frag']++;
  W.audio.play('buy', null);
  return true;
}

export function buyKit(S, W, a) {
  if (a.team !== 'G' || a.hasKit || a.money < KIT_PRICE) return false;
  a.money -= KIT_PRICE;
  a.hasKit = true;
  W.audio.play('buy', null);
  return true;
}
