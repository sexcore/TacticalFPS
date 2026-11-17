// Bots: nav-graph movement, vision cone + hearing, burst fire, objectives.
// Strike roles: carrier (plants), push/push2 (mid then site), lurk (holds
// mid), flank (west lane then site). Guard roles: holdA / holdB (site
// posts), holdMid (mid hall), holdCon (connector); all rotate to a planted
// charge and defuse. Guard bots share what they see/hear as minimap intel
// and speak radio callouts on real perception events.
import * as THREE from 'three';
import { CFG } from './config.js';
import { findPath, nearestNode, SITES, areaAt } from './map.js';
import { moveBody, losClear } from './collide.js';
import { angleLerp, angleDiff, clamp, rand, dist2XZ } from './math.js';
import { fireWeapon, startReload, eyePos, throwGrenade, tickAgent, bodyHeight, smokeBlocks } from './weapons.js';
import { pushRadio } from './state.js';

const BOT_SPEED = 4.0;
const BOT_SEE = 46;
const BOT_FOV = 2.1;
const BOT_TURN = 3.6;
const SITE_NODE = { A: 10, B: 33 };
const POST_NODE = { holdA: 39, holdB: 41, holdMid: 17, holdCon: 48 };

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();

function yawToPoint(a, x, z) { return Math.atan2(-(x - a.pos.x), -(z - a.pos.z)); }

export function initBot(a, role) {
  a.bot = {
    role, state: 'idle',
    path: new Int16Array(64), pathLen: 0, pathI: 0, destNode: -1, purpose: '',
    target: null, reactT: 0, loseT: 0, aimErrY: 0, aimErrP: 0,
    burstLeft: 0, burstPause: 0, strafeDir: 1, strafeT: 0,
    lookYaw: a.yaw, lookPitch: 0, scanBase: a.yaw, scanT: rand(0, 6),
    mvx: 0, mvz: 0, stuckT: 0, lastX: 0, lastZ: 0, checkT: 0,
    knownX: 0, knownZ: 0, knowT: 0, thrown: false, waitT: 0,
    callT: 0, retakeCalled: false, defuseCalled: false,
  };
}

export function resetBotForRound(a) {
  const b = a.bot;
  b.state = 'idle'; b.pathLen = 0; b.pathI = 0; b.destNode = -1; b.purpose = '';
  b.target = null; b.reactT = 0; b.loseT = 0; b.burstLeft = 0; b.burstPause = 0;
  b.strafeT = 0; b.lookYaw = a.yaw; b.lookPitch = 0; b.scanBase = a.yaw;
  b.mvx = 0; b.mvz = 0; b.stuckT = 0; b.knowT = 0; b.thrown = false;
  b.callT = 0; b.retakeCalled = false; b.defuseCalled = false;
  b.waitT = (b.role === 'push' || b.role === 'push2') ? 1.2 : 0;
  a.channel = null; a.crouch = false;
}

function setDest(S, W, a, node, purpose) {
  const b = a.bot;
  const from = nearestNode(W.nav, a.pos.x, a.pos.z);
  const len = findPath(W.nav, from, node, b.path);
  b.pathLen = len;
  b.pathI = len > 1 ? 1 : 0;
  b.destNode = node;
  b.purpose = purpose;
  b.state = 'move';
  b.stuckT = 0;
}

function duty(S, W, a) {
  const b = a.bot;
  if (a.team === 'S') {
    if (b.role === 'carrier') setDest(S, W, a, SITE_NODE[S.bomb.site], 'site');
    else if (b.role === 'push' || b.role === 'push2') setDest(S, W, a, 16, 'mid');
    else if (b.role === 'flank') setDest(S, W, a, 5, 'flank');
    else setDest(S, W, a, 16, 'lurk');
  } else {
    setDest(S, W, a, POST_NODE[b.role] || 39, 'post');
  }
}

function canSee(S, W, a, t) {
  eyePos(a, _eye);
  const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > BOT_SEE * BOT_SEE) return false;
  const yawTo = Math.atan2(-dx, -dz);
  if (Math.abs(angleDiff(yawTo, a.yaw)) > BOT_FOV / 2) return false;
  if (!losClear(W.cols, _eye.x, _eye.y, _eye.z, t.pos.x, t.pos.y + 1.15, t.pos.z)) return false;
  return !smokeBlocks(S, _eye.x, _eye.y, _eye.z, t.pos.x, t.pos.y + 1.15, t.pos.z);
}

function perceive(S, W, a, b, dt) {
  if (b.callT > 0) b.callT -= dt;
  const blind = a.blindT > 0;
  let best = null, bestD = Infinity;
  if (!blind) {
    for (const t of S.agents) {
      if (t.team === a.team || !t.alive) continue;
      const d2 = dist2XZ(a.pos.x, a.pos.z, t.pos.x, t.pos.z);
      if (d2 >= bestD) continue;
      if (canSee(S, W, a, t)) { best = t; bestD = d2; }
    }
  }
  if (best) {
    if (b.target !== best) {
      b.reactT = rand(0.3, 0.55);
      b.aimErrY = rand(-0.07, 0.07);
      b.aimErrP = rand(-0.04, 0.04);
      if (a.team === 'G' && b.callT <= 0) {
        pushRadio(S, a.name + ': Contact, ' + areaAt(best.pos.x, best.pos.z) + '!');
        b.callT = 8;
      }
    }
    b.target = best;
    b.loseT = 0;
    b.knownX = best.pos.x; b.knownZ = best.pos.z; b.knowT = 1.5;
    if (a.team === 'G') { best.intelT = S.time; best.intelX = best.pos.x; best.intelZ = best.pos.z; }
  } else {
    b.target = null;
  }
  for (const n of S.noises) {
    if (n.team === a.team) continue;
    if (dist2XZ(a.pos.x, a.pos.z, n.x, n.z) < n.r * n.r) {
      b.knownX = n.x; b.knownZ = n.z; b.knowT = 1.2;
      if (a.team === 'G' && n.who && n.who.team !== 'G') {
        n.who.intelT = S.time; n.who.intelX = n.x; n.who.intelZ = n.z;
      }
    }
  }
  if (a.hurtT > 0.1 && a.lastAttacker && a.lastAttacker.alive) {
    b.knownX = a.lastAttacker.pos.x; b.knownZ = a.lastAttacker.pos.z; b.knowT = 2;
    if (!blind && canSee(S, W, a, a.lastAttacker)) {
      b.target = a.lastAttacker;
      b.reactT = Math.min(b.reactT, 0.15);
      b.loseT = 0;
    }
  }
  if (b.reactT > 0) b.reactT -= dt;
  if (b.knowT > 0) b.knowT -= dt;
}

function arrive(S, W, a) {
  const b = a.bot;
  if (b.purpose === 'site') {
    if (b.role === 'carrier' && S.bomb.state === 'carried') b.state = 'plant';
    else { b.state = 'hold'; b.scanBase = yawToPoint(a, 0, 28); }
  } else if (b.purpose === 'mid' || b.purpose === 'flank') {
    setDest(S, W, a, SITE_NODE[S.bomb.site], 'site');
  } else if (b.purpose === 'lurk') {
    b.state = 'hold'; b.scanBase = yawToPoint(a, 0, 24);
  } else if (b.purpose === 'post') {
    b.state = 'hold'; b.scanBase = yawToPoint(a, 0, -10);
  } else if (b.purpose === 'retake') {
    if (S.bomb.state === 'planted' && dist2XZ(a.pos.x, a.pos.z, S.bomb.pos.x, S.bomb.pos.z) < 6.25) b.state = 'defuse';
    else { b.state = 'hold'; b.scanBase = yawToPoint(a, S.bomb.pos.x, S.bomb.pos.z); }
  } else {
    b.state = 'hold'; b.scanBase = a.yaw; b.waitT = 1.0;
  }
}

function updateMove(S, W, a, b, dt) {
  if (b.target && b.reactT <= 0) { b.state = 'engage'; return; }
  if (b.pathI < b.pathLen) {
    const wp = W.nav.nodes[b.path[b.pathI]];
    const dx = wp[0] - a.pos.x, dz = wp[1] - a.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.64) {
      b.pathI++;
      if (b.pathI >= b.pathLen) arrive(S, W, a);
    } else {
      const d = Math.sqrt(d2);
      b.mvx = dx / d; b.mvz = dz / d;
      b.lookYaw = Math.atan2(-dx, -dz);
      b.lookPitch = 0;
    }
  } else {
    arrive(S, W, a);
  }
  b.checkT += dt;
  if (b.checkT > 0.4) {
    b.checkT = 0;
    if ((b.mvx !== 0 || b.mvz !== 0) && dist2XZ(a.pos.x, a.pos.z, b.lastX, b.lastZ) < 0.04) {
      b.stuckT++;
      if (b.stuckT >= 2) { b.stuckT = 0; setDest(S, W, a, b.destNode, b.purpose); }
    } else b.stuckT = 0;
    b.lastX = a.pos.x; b.lastZ = a.pos.z;
  }
}

function updateHold(S, W, a, b, dt) {
  if (b.target && b.reactT <= 0) { b.state = 'engage'; a.crouch = false; return; }
  b.scanT += dt;
  b.lookYaw = b.scanBase + Math.sin(b.scanT * 0.6) * 0.7;
  b.lookPitch = 0;
  a.crouch = a.team === 'G' && (a.id % 2 === 0);
  if (S.bomb.state === 'planted' && a.team === 'G') {
    setDest(S, W, a, nearestNode(W.nav, S.bomb.pos.x, S.bomb.pos.z), 'retake');
    if (!b.retakeCalled) {
      b.retakeCalled = true;
      pushRadio(S, a.name + ': Rotating to Site ' + S.bomb.site + '!');
    }
  } else if (S.bomb.state === 'planted' && b.role === 'lurk') {
    setDest(S, W, a, SITE_NODE[S.bomb.site], 'site');
  } else if (b.purpose === 'investigate') {
    b.waitT -= dt;
    if (b.waitT <= 0) duty(S, W, a);
  } else if (b.knowT > 0 && a.team === 'S') {
    setDest(S, W, a, nearestNode(W.nav, b.knownX, b.knownZ), 'investigate');
  } else if (b.knowT > 0) {
    b.lookYaw = yawToPoint(a, b.knownX, b.knownZ);
  }
}

function updateEngage(S, W, a, b, dt) {
  const t = b.target;
  if (!t || !t.alive) {
    b.loseT += dt;
    if (b.loseT > 1.2) {
      if (b.knowT > 0) setDest(S, W, a, nearestNode(W.nav, b.knownX, b.knownZ), 'investigate');
      else duty(S, W, a);
    }
    return;
  }
  b.loseT = 0;
  const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  eyePos(a, _eye);
  const dy = (t.pos.y + 1.15) - _eye.y;
  b.lookYaw = Math.atan2(-dx, -dz);
  b.lookPitch = Math.atan2(dy, Math.max(dist, 0.01));
  b.strafeT -= dt;
  if (b.strafeT <= 0) { b.strafeT = rand(0.7, 1.4); b.strafeDir = -b.strafeDir; }
  const inv = 1 / (dist || 1);
  b.mvx = -dz * inv * b.strafeDir * 0.45;
  b.mvz = dx * inv * b.strafeDir * 0.45;
  a.crouch = dist > 14;
  const decay = Math.exp(-dt * 1.5);
  b.aimErrY *= decay; b.aimErrP *= decay;
  if (b.reactT > 0) return;
  if (b.burstPause > 0) {
    b.burstPause -= dt;
  } else if (a.mag[a.weapon] <= 0) {
    startReload(S, W, a);
  } else if (a.reloadT <= 0 && a.fireT <= 0) {
    if (b.burstLeft <= 0) b.burstLeft = a.weapon === 'lr88' ? 1 : 3 + ((Math.random() * 3) | 0);
    const yaw = a.yaw + b.aimErrY;
    const pitch = clamp(a.pitch + b.aimErrP, -1.45, 1.45);
    const cp = Math.cos(pitch);
    _dir.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    fireWeapon(S, W, a, _dir);
    b.burstLeft--;
    if (b.burstLeft <= 0) b.burstPause = rand(0.3, 0.55);
  }
  if (!b.thrown && a.nade.frag > 0 && dist > 10 && dist < 28 && Math.random() < 0.004) {
    _dir.set(dx, dy + 3, dz).normalize();
    if (throwGrenade(S, W, a, _dir, 'frag')) b.thrown = true;
  }
}

function updatePlant(S, W, a, b) {
  if (b.target && b.reactT <= 0) { b.state = 'engage'; a.channel = null; return; }
  if (S.bomb.state !== 'carried') { b.state = 'hold'; b.scanBase = yawToPoint(a, 0, 28); a.channel = null; return; }
  const site = SITES[S.bomb.site];
  if (Math.abs(a.pos.x - site.cx) <= site.hw && Math.abs(a.pos.z - site.cz) <= site.hd) {
    a.channel = { kind: 'plant' };
    b.lookYaw = yawToPoint(a, 0, 28);
    b.lookPitch = 0;
  } else {
    setDest(S, W, a, SITE_NODE[S.bomb.site], 'site');
  }
}

function updateDefuse(S, W, a, b) {
  if (b.target && b.reactT <= 0) { b.state = 'engage'; a.channel = null; return; }
  if (S.bomb.state !== 'planted') { duty(S, W, a); a.channel = null; return; }
  if (dist2XZ(a.pos.x, a.pos.z, S.bomb.pos.x, S.bomb.pos.z) > 2.56) {
    setDest(S, W, a, nearestNode(W.nav, S.bomb.pos.x, S.bomb.pos.z), 'retake');
    a.channel = null;
    return;
  }
  a.channel = { kind: 'defuse' };
  if (!b.defuseCalled) {
    b.defuseCalled = true;
    pushRadio(S, a.name + ': Defusing the Furnace Core — cover me!');
  }
  b.lookYaw = yawToPoint(a, S.bomb.pos.x, S.bomb.pos.z);
  b.lookPitch = -0.3;
}

export function updateBots(S, W, dt) {
  for (const a of S.agents) {
    if (a.isPlayer || !a.bot) continue;
    if (!a.alive) { a.deadT += dt; continue; }
    tickAgent(S, a, dt);
    const b = a.bot;
    if (S.phase === 'freeze' || S.phase === 'end') {
      a.channel = null;
      a.vel.x = 0; a.vel.z = 0;
      a.vel.y -= CFG.gravity * dt;
      a.onGround = moveBody(W.cols, a.pos, a.vel, dt, CFG.bodyHalf, bodyHeight(a));
      a.yaw = angleLerp(a.yaw, b.scanBase, 1 - Math.exp(-2 * dt));
      continue;
    }
    if (S.phase !== 'live') continue;
    b.mvx = 0; b.mvz = 0;
    perceive(S, W, a, b, dt);
    if (b.state === 'idle') {
      if (b.waitT > 0) b.waitT -= dt;
      else duty(S, W, a);
    }
    if (b.state === 'move') updateMove(S, W, a, b, dt);
    else if (b.state === 'hold') updateHold(S, W, a, b, dt);
    else if (b.state === 'engage') updateEngage(S, W, a, b, dt);
    else if (b.state === 'plant') updatePlant(S, W, a, b);
    else if (b.state === 'defuse') updateDefuse(S, W, a, b);
    // Look smoothing
    const lt = 1 - Math.exp(-BOT_TURN * dt);
    a.yaw = angleLerp(a.yaw, b.lookYaw, lt);
    a.pitch = clamp(a.pitch + (b.lookPitch - a.pitch) * lt, -1.45, 1.45);
    // Movement with the same accel model as the player
    const speed = a.crouch ? CFG.crouchSpeed : BOT_SPEED;
    const tx = b.mvx * speed, tz = b.mvz * speed;
    const acc = a.onGround ? CFG.accelGround : CFG.accelAir;
    a.vel.x += clamp(tx - a.vel.x, -acc * dt, acc * dt);
    a.vel.z += clamp(tz - a.vel.z, -acc * dt, acc * dt);
    a.vel.y -= CFG.gravity * dt;
    a.onGround = moveBody(W.cols, a.pos, a.vel, dt, CFG.bodyHalf, bodyHeight(a));
    // Footstep noise
    if (a.onGround && Math.hypot(a.vel.x, a.vel.z) > 2) {
      a.stepT -= dt;
      if (a.stepT <= 0) {
        a.stepT = 0.42;
        S.noises.push({ x: a.pos.x, y: a.pos.y, z: a.pos.z, team: a.team, t: S.time, r: CFG.hearStep, who: a });
      }
    }
  }
}
