// FOUNDRY boot: renderer, lights, agent meshes, viewmodel, fixed-step loop,
// camera work. The sim (state + rounds + bots + player) runs at 60 Hz in
// sim.step; rendering only mirrors state, never writes gameplay truth.
import * as THREE from 'three';
import { CFG, WEAPONS, PALETTE } from './config.js';
import { createState, makeAgent } from './state.js';
import { buildMap } from './map.js';
import { AudioSys } from './audio.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { updatePlayer } from './player.js';
import { updateBots, initBot } from './bots.js';
import { updateRounds, startRound, resetMatch } from './rounds.js';
import { initGrenades, updateGrenades, updateSmokes, eyePos } from './weapons.js';
import { clamp, DEG } from './math.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 48, 130);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemi = new THREE.HemisphereLight(0x8fa3b8, 0x3a352e, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 3.0);
sun.position.set(30, 42, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0005;
scene.add(sun);

// ---------------------------------------------------------------- state
const S = createState();
const audio = new AudioSys();
const fx = new FX(scene);
const map = buildMap(scene);
const W = { cols: map.colliders, nav: map.nav, fx, audio };

const player = makeAgent('G', 'You', true);
const bram = makeAgent('G', 'Bram', false);
const kessler = makeAgent('G', 'Kessler', false);
const odo = makeAgent('G', 'Odo', false);
const petra = makeAgent('G', 'Petra', false);
const vex = makeAgent('S', 'Vex', false);
const rook = makeAgent('S', 'Rook', false);
const mara = makeAgent('S', 'Mara', false);
const joss = makeAgent('S', 'Joss', false);
const tarn = makeAgent('S', 'Tarn', false);
S.agents = [player, bram, kessler, odo, petra, vex, rook, mara, joss, tarn];
S.player = player;
initBot(bram, 'holdA');
initBot(kessler, 'holdB');
initBot(odo, 'holdMid');
initBot(petra, 'holdCon');
initBot(vex, 'carrier');
initBot(rook, 'push');
initBot(mara, 'lurk');
initBot(joss, 'push2');
initBot(tarn, 'flank');
initGrenades(S);

// ---------------------------------------------------------------- meshes
const GEO = {
  leg: new THREE.BoxGeometry(0.22, 0.8, 0.24),
  torso: new THREE.BoxGeometry(0.6, 0.55, 0.34),
  arm: new THREE.BoxGeometry(0.16, 0.55, 0.18),
  head: new THREE.BoxGeometry(0.38, 0.42, 0.4),
  helmet: new THREE.BoxGeometry(0.44, 0.18, 0.46),
  gun: new THREE.BoxGeometry(0.09, 0.14, 0.72),
};
const MATS = {
  guard: new THREE.MeshStandardMaterial({ color: PALETTE.guard, roughness: 0.8 }),
  strike: new THREE.MeshStandardMaterial({ color: PALETTE.strike, roughness: 0.8 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.85 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xc9a686, roughness: 0.75 }),
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x565660, roughness: 0.6, metalness: 0.05 }),
  flash: new THREE.MeshStandardMaterial({ color: 0xf2f2e8, roughness: 0.5 }),
  smoke: new THREE.MeshStandardMaterial({ color: 0x6a7a5a, roughness: 0.8 }),
};

// Name tags: canvas sprite with the agent's name + health bar, drawn only
// when HP changes. Enemies show only while recently seen/heard (same intel
// rule as the minimap) — never through walls.
function makeTag(a) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 36;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  sprite.scale.set(1.4, 0.4, 1);
  sprite.position.y = 2.15;
  return { sprite, canvas, ctx, tex, lastHp: -1 };
}

function drawTag(a) {
  const tag = a.tag;
  const hp = Math.max(0, Math.ceil(a.hp));
  if (hp === tag.lastHp) return;
  tag.lastHp = hp;
  const c = tag.ctx;
  c.clearRect(0, 0, 128, 36);
  c.font = 'bold 16px sans-serif';
  c.textAlign = 'center';
  c.fillStyle = a.team === 'G' ? '#4db2e8' : '#ff7a45';
  c.fillText(a.name, 64, 17);
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.fillRect(16, 24, 96, 5);
  c.fillStyle = hp > 50 ? '#7dd87d' : hp > 25 ? '#e8b64d' : '#e84d4d';
  c.fillRect(16, 24, 96 * hp / 100, 5);
  tag.tex.needsUpdate = true;
}

function buildAgentMesh(team) {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const teamMat = team === 'G' ? MATS.guard : MATS.strike;
  const legL = new THREE.Group(); legL.position.set(-0.14, 0.8, 0);
  const legR = new THREE.Group(); legR.position.set(0.14, 0.8, 0);
  const legLm = new THREE.Mesh(GEO.leg, MATS.dark); legLm.position.y = -0.4;
  const legRm = new THREE.Mesh(GEO.leg, MATS.dark); legRm.position.y = -0.4;
  legL.add(legLm); legR.add(legRm);
  const torso = new THREE.Mesh(GEO.torso, teamMat);
  torso.position.y = 1.075; torso.castShadow = true;
  const armL = new THREE.Group(); armL.position.set(-0.39, 1.3, 0);
  const armR = new THREE.Group(); armR.position.set(0.39, 1.3, 0);
  const armLm = new THREE.Mesh(GEO.arm, teamMat); armLm.position.y = -0.22;
  const armRm = new THREE.Mesh(GEO.arm, teamMat); armRm.position.y = -0.22;
  armL.add(armLm); armR.add(armRm);
  armL.rotation.x = -1.15; armR.rotation.x = -1.15;
  const headG = new THREE.Group(); headG.position.y = 1.35;
  const head = new THREE.Mesh(GEO.head, MATS.skin); head.position.y = 0.21; head.castShadow = true;
  const helmet = new THREE.Mesh(GEO.helmet, teamMat); helmet.position.y = 0.38;
  headG.add(head, helmet);
  const gun = new THREE.Mesh(GEO.gun, MATS.gunmetal);
  gun.position.set(0.2, 1.1, -0.3);
  root.add(legL, legR, torso, armL, armR, headG, gun);
  scene.add(root);
  return { root, legL, legR, armL, armR, headG, phase: 0 };
}

for (const a of S.agents) {
  const built = buildAgentMesh(a.team);
  a.mesh = built.root;
  a.parts = built;
  if (a.isPlayer) a.mesh.visible = false;
  a.tag = makeTag(a);
  a.mesh.add(a.tag.sprite);
  drawTag(a);
}

// Viewmodel guns (camera children, one visible per weapon class)
function buildViewGun(kind) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, kind === 'pistol' ? 0.3 : 0.52), MATS.gunmetal);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), MATS.dark);
  grip.position.set(0, -0.09, 0.1);
  grip.rotation.x = 0.25;
  g.add(body, grip);
  if (kind !== 'pistol') {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.09), MATS.dark);
    mag.position.set(0, -0.1, -0.02);
    mag.rotation.x = 0.12;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), MATS.gunmetal);
    barrel.position.set(0, 0.02, kind === 'marksman' ? -0.42 : -0.36);
    g.add(mag, barrel);
  }
  if (kind === 'marksman') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), MATS.dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.075, -0.05);
    g.add(scope);
  }
  if (kind === 'rifle') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.16), MATS.dark);
    stock.position.set(0, -0.01, 0.3);
    g.add(stock);
  }
  g.visible = false;
  g.scale.setScalar(0.55);
  camera.add(g);
  return g;
}
const vmGuns = { pistol: buildViewGun('pistol'), rifle: buildViewGun('rifle'), marksman: buildViewGun('marksman') };
function vmKind(weapon) {
  if (weapon === 'p9') return 'pistol';
  if (weapon === 'lr88') return 'marksman';
  return 'rifle';
}

// Bomb prop
const bombProp = new THREE.Group();
const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35), MATS.dark);
bombBody.position.y = 0.15;
const bombLightMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), bombLightMat);
bombLight.position.set(0.15, 0.34, 0);
const bombAntenna = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), MATS.gunmetal);
bombAntenna.position.set(-0.15, 0.42, 0);
bombProp.add(bombBody, bombLight, bombAntenna);
bombProp.visible = false;
scene.add(bombProp);

// Grenade meshes
const grenadeGeo = new THREE.SphereGeometry(0.12, 10, 8);
for (const g of S.grenades) {
  const m = new THREE.Mesh(grenadeGeo, MATS.gunmetal);
  m.visible = false;
  scene.add(m);
  g.mesh = m;
}

// ---------------------------------------------------------------- ui
const hud = new HUD(S, W, {
  onStart: () => {
    audio.init(player.pos);
    S.started = true;
    resetMatch(S);
    startRound(S, W);
    hud.hideStart();
    lockPointer();
  },
  onResume: () => lockPointer(),
});
const input = new Input();
input.attach(canvas);
input.onLockChange = (locked) => {
  if (!S.started) return;
  S.paused = !locked;
  hud.setPaused(!locked);
};
input.onClickWhileUnlocked = () => { if (S.started && S.paused) lockPointer(); };

function lockPointer() {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => { /* user clicks again */ });
  } catch (e) { /* user clicks again */ }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Menu backdrop: agents placed at spawns, sim held in menu phase.
startRound(S, W);
S.phase = 'menu';

// ---------------------------------------------------------------- sync
const _eye = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();
let bobPhase = 0;
let zoomK = 0;
let blinkPhase = 0;
let fov = 75;

function syncTag(a) {
  if (a.isPlayer) { a.tag.sprite.visible = false; return; }
  if (!a.alive) { a.tag.sprite.visible = false; return; }
  if (a.team === 'G') {
    a.tag.sprite.visible = true;
  } else {
    // Enemy tags: fresh intel, in front of the camera, within sight range.
    _to.copy(a.pos).sub(camera.position);
    const d = _to.length();
    camera.getWorldDirection(_fwd);
    const facing = d > 0.01 ? _to.dot(_fwd) / d : 1;
    a.tag.sprite.visible = S.time - a.intelT < 2 && facing > 0.1 && d < 46;
  }
  if (a.tag.sprite.visible) drawTag(a);
}

function syncAgent(a, dt) {
  const m = a.mesh;
  m.position.copy(a.pos);
  m.rotation.y = a.yaw;
  const parts = a.parts;
  if (!a.alive) {
    const k = Math.min(1, a.deadT * 2.2);
    m.rotation.x = -Math.PI / 2 * k * 0.96;
    return;
  }
  m.rotation.x = 0;
  const speed = Math.hypot(a.vel.x, a.vel.z);
  parts.phase += dt * (2 + speed * 1.9);
  const sw = Math.min(1, speed / 4) * 0.55;
  const s = Math.sin(parts.phase);
  parts.legL.rotation.x = s * sw;
  parts.legR.rotation.x = -s * sw;
  parts.armL.rotation.x = -1.15 - s * sw * 0.25;
  parts.armR.rotation.x = -1.15 + s * sw * 0.25;
  parts.headG.rotation.x = a.pitch * 0.5;
  const targetSY = a.crouch ? 0.72 : 1;
  m.scale.y += (targetSY - m.scale.y) * Math.min(1, dt * 10);
}

function syncCamera(dt) {
  const p = player;
  if (S.phase === 'menu') {
    const t = S.time * 0.08;
    camera.position.set(Math.sin(t) * 30, 17, Math.cos(t) * 30);
    camera.lookAt(0, 0.5, 0);
    return;
  }
  if (!p.alive) {
    // Spectate the first living teammate, else an overhead view.
    let mate = null;
    for (const a of S.agents) {
      if (a.team === 'G' && a.alive && !a.isPlayer) { mate = a; break; }
    }
    if (mate) {
      eyePos(mate, _eye);
      camera.position.copy(_eye);
      camera.rotation.y = mate.yaw;
      camera.rotation.x = mate.pitch;
      camera.rotation.z = 0;
    } else {
      camera.position.set(0, 26, 30);
      camera.lookAt(0, 0, 0);
    }
    return;
  }
  const speed = Math.hypot(p.vel.x, p.vel.z);
  const speedF = clamp(speed / CFG.walkSpeed, 0, 1);
  if (p.onGround && speed > 0.5) bobPhase += dt * (4 + speed * 1.6);
  eyePos(p, _eye);
  camera.position.copy(_eye);
  camera.position.y += Math.sin(bobPhase * 2) * 0.022 * speedF;
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  const sway = Math.cos(bobPhase) * 0.014 * speedF;
  camera.position.x += rx * sway;
  camera.position.z += rz * sway;
  camera.rotation.y = p.yaw + p.recoilY * DEG;
  camera.rotation.x = p.pitch + p.recoilP * DEG;
  camera.rotation.z = 0;
  if (S.shake > 0) {
    camera.rotation.x += (Math.random() - 0.5) * 0.03 * S.shake;
    camera.rotation.y += (Math.random() - 0.5) * 0.03 * S.shake;
  }
  // Zoom FOV
  zoomK += ((p.zoomed ? 1 : 0) - zoomK) * Math.min(1, dt * 12);
  const zoom = WEAPONS[p.weapon].zoom;
  const targetFov = zoom > 1 ? 75 / (1 + zoomK * (zoom - 1)) : 75;
  if (Math.abs(targetFov - fov) > 0.01) {
    fov = targetFov;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  // Viewmodel
  for (const k of Object.keys(vmGuns)) vmGuns[k].visible = false;
  const gun = vmGuns[vmKind(p.weapon)];
  gun.visible = true;
  const baseX = 0.24 * (1 - zoomK), baseY = -0.21 + zoomK * 0.075, baseZ = -0.45 + zoomK * 0.14;
  const kick = p.recoilP * 0.006;
  gun.position.set(
    baseX + Math.cos(bobPhase) * 0.006 * speedF,
    baseY + Math.sin(bobPhase * 2) * 0.008 * speedF,
    baseZ + kick
  );
  gun.rotation.x = p.recoilP * 0.01;
  gun.rotation.z = 0;
  if (p.reloadT > 0) {
    const w = WEAPONS[p.weapon];
    const frac = 1 - p.reloadT / w.reload;
    const dip = Math.sin(clamp(frac, 0, 1) * Math.PI);
    gun.rotation.z = dip * 0.5;
    gun.position.y -= dip * 0.08;
  }
}

function syncProps(dt) {
  const planted = S.bomb.state === 'planted';
  const dropped = S.bomb.state === 'dropped';
  bombProp.visible = planted || dropped;
  if (bombProp.visible) {
    bombProp.position.set(S.bomb.pos.x, 0, S.bomb.pos.z);
    const rate = planted ? 2 + (1 - S.bomb.fuse / CFG.fuseTime) * 10 : 2;
    blinkPhase += dt * rate;
    bombLightMat.color.setHex(Math.sin(blinkPhase) > 0 ? 0xff3020 : 0x551008);
  }
  for (const g of S.grenades) {
    if (!g.mesh) continue;
    g.mesh.visible = g.active;
    if (g.active) {
      g.mesh.position.copy(g.pos);
      g.mesh.material = g.kind === 'flash' ? MATS.flash : g.kind === 'smoke' ? MATS.smoke : MATS.gunmetal;
      g.mesh.rotation.x += dt * 6;
      g.mesh.rotation.z += dt * 4;
    }
  }
  // Rings carry separate per-site materials: pulse only the planted site.
  map.rings.A.material.opacity = planted && S.bomb.site === 'A' ? 0.55 + Math.sin(S.time * 4) * 0.25 : 0.55;
  map.rings.B.material.opacity = planted && S.bomb.site === 'B' ? 0.55 + Math.sin(S.time * 4) * 0.25 : 0.55;
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let acc = 0;

function frame(now) {
  const dtRender = Math.min(0.05, (now - last) / 1000);
  last = now;
  const stepping = S.started && !S.paused && S.phase !== 'menu';
  if (stepping) {
    acc += dtRender;
    let steps = 0;
    while (acc >= CFG.simDt && steps < 4) {
      updateRounds(S, W, CFG.simDt);
      updatePlayer(S, W, input, hud, CFG.simDt);
      updateBots(S, W, CFG.simDt);
      updateGrenades(S, W, CFG.simDt);
      updateSmokes(S, CFG.simDt);
      acc -= CFG.simDt;
      steps++;
    }
    if (steps === 4) acc = 0;
  } else {
    acc = 0;
    if (S.phase === 'menu') S.time += dtRender;
    if (S.paused) input.discard();
  }
  for (const a of S.agents) syncAgent(a, dtRender);
  for (const a of S.agents) syncTag(a);
  syncCamera(dtRender);
  syncProps(dtRender);
  fx.update(dtRender);
  hud.update(S);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(frame);

// Read-only debug snapshot for screenshot capture tooling. Off by default;
// enabled only with ?debug=1 in the URL. Returns a plain-object copy — no
// live references, no mutation API, no effect on gameplay.
if (new URLSearchParams(location.search).get('debug') === '1') {
  window.__foundry = () => ({
    time: S.time,
    phase: S.phase,
    phaseT: S.phaseT,
    round: S.round,
    score: { G: S.score.G, S: S.score.S },
    matchOver: S.matchOver,
    matchWinner: S.matchWinner,
    bomb: {
      state: S.bomb.state, site: S.bomb.site,
      x: S.bomb.pos.x, z: S.bomb.pos.z,
      fuse: S.bomb.fuse, plantT: S.bomb.plantT, defuseT: S.bomb.defuseT,
      carrier: S.bomb.carrier ? S.bomb.carrier.name : null,
    },
    player: {
      x: player.pos.x, z: player.pos.z, yaw: player.yaw, pitch: player.pitch,
      hp: player.hp, alive: player.alive, channel: player.channel ? player.channel.kind : null,
      hasKit: player.hasKit,
    },
    radio: S.radio.map((r) => r.text),
    agents: S.agents.map((a) => ({
      name: a.name, team: a.team, x: a.pos.x, z: a.pos.z,
      yaw: a.yaw, hp: a.hp, alive: a.alive, isPlayer: a.isPlayer,
    })),
    nav: { nodes: W.nav.nodes, adj: W.nav.adj },
  });
}
