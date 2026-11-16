// Player: mouse look, WASD accel movement, jump, crouch, fire/reload/switch,
// grenades, buy keys, defuse interact. Sim-side only; the camera mirrors it.
import * as THREE from 'three';
import { CFG, WEAPONS } from './config.js';
import { moveBody } from './collide.js';
import { clamp, dist2XZ } from './math.js';
import { fireWeapon, startReload, switchWeapon, throwGrenade, tickAgent, aimDir, bodyHeight } from './weapons.js';
import { tryBuy } from './hud.js';

const _dir = new THREE.Vector3();

export function updatePlayer(S, W, input, hud, dt) {
  const p = S.player;
  if (!p || !p.alive) { input.discard(); return; }
  tickAgent(S, p, dt);
  // Look
  const sens = p.zoomed ? 0.0009 : 0.0021;
  p.yaw -= input.dx * sens;
  p.pitch = clamp(p.pitch - input.dy * sens, -1.45, 1.45);
  input.dx = 0;
  input.dy = 0;
  p.crouch = input.down('ControlLeft') || input.down('ControlRight') || input.down('KeyC');
  // Wish direction in world space
  let ix = 0, iz = 0;
  if (input.down('KeyW')) iz -= 1;
  if (input.down('KeyS')) iz += 1;
  if (input.down('KeyA')) ix -= 1;
  if (input.down('KeyD')) ix += 1;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let wx = (-sy) * (-iz) + cy * ix;
  let wz = (-cy) * (-iz) + (-sy) * ix;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }
  if (S.phase === 'freeze') { wx = 0; wz = 0; } // freeze time: look and buy, no move
  const speed = p.crouch ? CFG.crouchSpeed : CFG.walkSpeed;
  const acc = p.onGround ? CFG.accelGround : CFG.accelAir;
  p.vel.x += clamp(wx * speed - p.vel.x, -acc * dt, acc * dt);
  p.vel.z += clamp(wz * speed - p.vel.z, -acc * dt, acc * dt);
  if (input.wasPressed('Space') && p.onGround && S.phase !== 'freeze') {
    p.vel.y = CFG.jumpVel;
    p.onGround = false;
  }
  p.vel.y -= CFG.gravity * dt;
  p.onGround = moveBody(W.cols, p.pos, p.vel, dt, CFG.bodyHalf, bodyHeight(p));
  // Footsteps: heard by bots, audible to the player
  if (p.onGround && Math.hypot(p.vel.x, p.vel.z) > 2) {
    p.stepT -= dt;
    if (p.stepT <= 0) {
      p.stepT = p.crouch ? 0.55 : 0.38;
      W.audio.play('step', null);
      S.noises.push({ x: p.pos.x, y: p.pos.y, z: p.pos.z, team: p.team, t: S.time, r: CFG.hearStep });
    }
  }
  // Zoom (marksman rifle only)
  p.zoomed = input.rDown && p.weapon === 'lr88';
  // Fire (live phase only)
  const w = WEAPONS[p.weapon];
  const wantFire = w.auto ? input.mouseDown : input.mouseDownEdge;
  if (wantFire && p.fireT <= 0 && p.reloadT <= 0 && S.phase === 'live') {
    aimDir(p, _dir);
    fireWeapon(S, W, p, _dir);
  }
  if (input.wasPressed('KeyR')) startReload(S, W, p);
  if (input.wasPressed('KeyQ')) {
    switchWeapon(S, W, p, p.weapon === p.primary ? p.secondary : (p.primary || p.secondary));
  }
  if (input.wheelDir !== 0 && p.primary && !hud.buyOpen) {
    switchWeapon(S, W, p, p.weapon === p.primary ? p.secondary : p.primary);
  }
  // Buy menu toggle + number keys (buy when open, switch/grenade when closed)
  if (input.wasPressed('KeyB')) hud.toggleBuy();
  if (hud.buyOpen) {
    if (input.wasPressed('Digit1')) tryBuy(S, W, 'k7');
    else if (input.wasPressed('Digit2')) tryBuy(S, W, 'ar4');
    else if (input.wasPressed('Digit3')) tryBuy(S, W, 'lr88');
    else if (input.wasPressed('Digit4')) tryBuy(S, W, 'grenade');
    else if (input.wasPressed('Digit5')) tryBuy(S, W, 'armor');
  } else {
    if (input.wasPressed('Digit1') && p.primary) switchWeapon(S, W, p, p.primary);
    if (input.wasPressed('Digit2')) switchWeapon(S, W, p, p.secondary);
    if ((input.wasPressed('Digit3') || input.wasPressed('KeyG')) && S.phase === 'live') {
      aimDir(p, _dir);
      throwGrenade(S, W, p, _dir);
    }
  }
  // Defuse: hold E, standing still, next to a planted charge
  const nearBomb = S.bomb.state === 'planted'
    && dist2XZ(p.pos.x, p.pos.z, S.bomb.pos.x, S.bomb.pos.z) < 2.89
    && Math.hypot(p.vel.x, p.vel.z) < 0.5;
  if (nearBomb && input.down('KeyE')) p.channel = { kind: 'defuse' };
  else if (p.channel && p.channel.kind === 'defuse') p.channel = null;
  input.consumeEdges();
}
