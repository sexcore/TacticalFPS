// FOUNDRY map: an industrial yard at dusk. Original layout — two bomb sites,
// three lanes, one mid hall, one connector corridor. Boxes are
// [cx, y0, cz, sx, sz, height, material, shape?]. Waypoints form the bot nav
// graph; every edge was checked to cross no wall.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { buildColliders } from './collide.js';

// Materials: 0 concrete, 1 dark, 2 rust, 3 metal, 4 crate, 5 sand, 6 teal, 7 barrel,
// 8 site-A crate (amber tint), 9 site-B crate (teal tint). Site tints are
// visual only — colliders and the nav graph never see a material index.
export const BOXES = [
  // Perimeter (inner faces at +/-32)
  [0, 0, -33.5, 70, 3, 7, 1], [0, 0, 33.5, 70, 3, 7, 1],
  [-33.5, 0, 0, 3, 70, 7, 1], [33.5, 0, 0, 3, 70, 7, 1],
  // Attacker spawn funnels: none — spawn stays open so the nav graph is clear
  // Site A warehouse (west), doors north / east / south
  [-26.5, 0, -14, 1.5, 13, 5, 0], [-23, 0, -20.5, 5, 1.5, 5, 0], [-15.5, 0, -20.5, 4, 1.5, 5, 0],
  [-11.5, 0, -17, 1.5, 5, 5, 0], [-11.5, 0, -10.5, 1.5, 4, 5, 0],
  [-23, 0, -7.5, 5, 1.5, 5, 0], [-15, 0, -7.5, 6, 1.5, 5, 0],
  [-22, 0, -12, 1, 1, 4, 1], [-16, 0, -17, 1, 1, 4, 1],
  [-24, 0, -11, 2, 2, 1.2, 8], [-15, 0, -10, 2.5, 2, 1.2, 8],
  [-23, 0, -17, 2, 2, 1.0, 8], [-14, 0, -15, 1.6, 1.6, 2.2, 8],
  // Site B yard (east), gaps north / south, half wall west
  [16, 0, -20.5, 6, 1.5, 5, 0], [23, 0, -20.5, 5, 1.5, 5, 0],
  [26.5, 0, -14, 1.5, 13, 5, 0],
  [15.5, 0, -7.5, 5, 1.5, 5, 0], [23, 0, -7.5, 5, 1.5, 5, 0],
  [12, 0, -14, 1.5, 6, 3, 0],
  [16, 0, -12, 4, 2.2, 2.6, 2], [22, 0, -17, 2.2, 5, 2.6, 2],
  [15, 0, -18, 2, 2, 1.2, 9], [24, 0, -10, 2, 2, 1.2, 9],
  // Mid hall, doors on all four sides
  [-8, 0, -3.5, 1.5, 5, 4, 0], [-8, 0, 3.5, 1.5, 5, 4, 0],
  [8, 0, -3.5, 1.5, 5, 4, 0], [8, 0, 3.5, 1.5, 5, 4, 0],
  [-4.5, 0, -6, 7, 1.5, 4, 0], [4.5, 0, -6, 7, 1.5, 4, 0],
  [-4.5, 0, 6, 7, 1.5, 4, 0], [4.5, 0, 6, 7, 1.5, 4, 0],
  [-4.5, 0, -3, 1, 1, 4, 1], [4.5, 0, 3, 1, 1, 4, 1],
  [-5, 0, 4, 2, 2, 1.1, 4], [5, 0, -4, 2, 2, 1.1, 4],
  // Connector corridor (z 10..14), gaps north x2, south x1
  [-12, 0, 10, 8, 1.2, 3.5, 0], [0, 0, 10, 8, 1.2, 3.5, 0], [12, 0, 10, 8, 1.2, 3.5, 0],
  [-10, 0, 14, 12, 1.2, 3.5, 0], [10, 0, 14, 12, 1.2, 3.5, 0],
  [-14, 0, 12, 2, 2, 1.1, 4], [14, 0, 12, 2, 2, 1.1, 4],
  // Lane cover
  [-30.5, 0, 0, 2, 2, 1.3, 4], [-30.5, 0, 10, 2, 2, 1.3, 4], [-29, 0, 18, 3, 2, 1.1, 4],
  [30.5, 0, 0, 2, 2, 1.3, 4], [30.5, 0, 10, 2, 2, 1.3, 4], [29, 0, 18, 3, 2, 1.1, 4],
  // Defender spawn cover
  [-6, 0, 26, 3, 2, 1.2, 4], [6, 0, 26, 3, 2, 1.2, 4],
  // Barrels
  [-13, 0, -9, 0.9, 0.9, 1.1, 7, 'cyl'], [13, 0, -9, 0.9, 0.9, 1.1, 7, 'cyl'],
  [-11.5, 0, 6, 0.9, 0.9, 1.1, 7, 'cyl'], [11.5, 0, 6, 0.9, 0.9, 1.1, 7, 'cyl'],
];

export const SITES = {
  A: { cx: -19, cz: -14, hw: 4, hd: 3, label: 'Furnace', accent: PALETTE.amber },
  B: { cx: 19, cz: -14, hw: 4, hd: 3, label: 'Yard', accent: PALETTE.teal },
};

export const SPAWNS = {
  G: [[-3, 27], [3, 27], [0, 29], [-6, 28], [6, 28]],
  S: [[0, -28], [-4, -29], [4, -29], [-7, -27], [7, -27]],
};

/** Named area for the minimap location label and bot callouts. */
export function areaAt(x, z) {
  if (Math.abs(x - SITES.A.cx) <= SITES.A.hw + 3 && Math.abs(z - SITES.A.cz) <= SITES.A.hd + 3) return 'SITE A · FURNACE';
  if (Math.abs(x - SITES.B.cx) <= SITES.B.hw + 3 && Math.abs(z - SITES.B.cz) <= SITES.B.hd + 3) return 'SITE B · YARD';
  if (Math.abs(x) <= 9 && z >= -6 && z <= 6) return 'MID HALL';
  if (Math.abs(x) <= 16 && z >= 10 && z <= 14) return 'CONNECTOR';
  if (z >= 22) return 'GUARD SPAWN';
  if (z <= -22) return 'STRIKE SPAWN';
  if (x <= -24) return 'WEST LANE';
  if (x >= 24) return 'EAST LANE';
  return z < 0 ? 'NORTH YARD' : 'SOUTH YARD';
}

// Nav graph: [x, z] nodes, undirected edges. Checked edge by edge vs BOXES.
export const WAYPOINTS = [
  [0, -28], [-8, -26], [-16, -26], [-28, -24], [-29, -16], [-28, -6], [-28, 4], [-28, 14],
  [-24, 20], [-19, -19], [-19, -14], [-13, -13.5], [-21.5, -9.5], [-4, -12], [4, -10], [0, -8],
  [0, -3], [0, 3], [0, 8], [-5, 12], [5, 12], [-12, 12], [12, 12], [0, 24],
  [-8, 22], [8, 22], [28, -24], [28, -14], [28, -4], [27, 6], [27, 16], [24, 20],
  [19, -19], [19, -14], [15, -10], [22, -9], [14, -26], [-15, 20], [14, 20],
  [-19, -6], [-19, -9], [19, -6], [19, -9], [19.7, -22], [19.7, -18.5], [-19, -23],
  [-6, 9], [6, 9], [0, 15.5], [-10, 0], [10, 0], [-8, 0], [8, 0],
];
export const EDGES = [
  [0, 1], [0, 36], [1, 2], [1, 13], [2, 3], [3, 4], [3, 45], [4, 5], [5, 6],
  [5, 39], [5, 49], [6, 7], [6, 46], [7, 8], [8, 37], [9, 10], [9, 12], [9, 45], [10, 11],
  [10, 12], [10, 40], [11, 13], [12, 40], [13, 14], [13, 15], [14, 15], [14, 34], [14, 36],
  [15, 16], [16, 17], [16, 51], [16, 52], [51, 49], [52, 50], [17, 18], [18, 46], [18, 47], [19, 21], [19, 46],
  [19, 48], [20, 22], [20, 47], [20, 48], [23, 24], [23, 25], [23, 48], [24, 37], [24, 48],
  [25, 38], [25, 48], [26, 36], [26, 43], [27, 28], [28, 29], [28, 41], [28, 50], [29, 30],
  [29, 47], [30, 31], [31, 38], [32, 33], [32, 44], [33, 35], [33, 42], [33, 44], [34, 42],
  [35, 42], [36, 43], [39, 40], [39, 49], [41, 42], [43, 44], [46, 47],
];

export function buildNav() {
  const adj = WAYPOINTS.map(() => []);
  for (const [a, b] of EDGES) { adj[a].push(b); adj[b].push(a); }
  return { nodes: WAYPOINTS, adj };
}

const _prev = new Int16Array(64);
const _queue = new Int16Array(64);
const _seen = new Uint8Array(64);

/** BFS path from node a to node b. Writes node indices into out, returns count. */
export function findPath(nav, a, b, out) {
  _seen.fill(0);
  let qh = 0, qt = 0;
  _queue[qt++] = a; _seen[a] = 1; _prev[a] = -1;
  while (qh < qt) {
    const n = _queue[qh++];
    if (n === b) break;
    const nb = nav.adj[n];
    for (let i = 0; i < nb.length; i++) {
      const m = nb[i];
      if (!_seen[m]) { _seen[m] = 1; _prev[m] = n; _queue[qt++] = m; }
    }
  }
  if (!_seen[b]) return 0;
  let n = b, count = 0;
  const rev = _queue; // reuse scratch as reverse buffer (queue no longer needed)
  while (n !== -1) { rev[count++] = n; n = _prev[n]; }
  for (let i = 0; i < count; i++) out[i] = rev[count - 1 - i];
  return count;
}

export function nearestNode(nav, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < nav.nodes.length; i++) {
    const dx = nav.nodes[i][0] - x, dz = nav.nodes[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------- textures

function canvasTex(size, draw, rx, ry) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx, s, n, colors, lo, hi) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    const w = lo + Math.random() * (hi - lo);
    ctx.fillRect(Math.random() * s, Math.random() * s, w, w);
  }
}

function makeMaterials() {
  const concrete = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#8a857c'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, ['#7d786e', '#948e83', '#6f6a60', '#9c968b'], 1, 3);
    ctx.strokeStyle = 'rgba(60,56,50,0.5)'; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, s - 8, s - 8);
  }, 2, 2);
  const metal = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#5d6a72'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 400, ['#525e66', '#68767e', '#4a565e'], 1, 3);
    ctx.strokeStyle = 'rgba(30,36,40,0.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
    ctx.fillStyle = 'rgba(150,90,50,0.25)';
    for (let i = 0; i < 5; i++) ctx.fillRect(Math.random() * s, 0, 3 + Math.random() * 5, s);
  }, 2, 1);
  const crate = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#7a5c38'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(50,36,20,0.8)'; ctx.lineWidth = 3;
    for (let y = 0; y <= s; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
    ctx.strokeRect(3, 3, s - 6, s - 6);
    speckle(ctx, s, 300, ['#6b4f2f', '#866842', '#5d452a'], 1, 3);
  }, 1, 1);
  const ground = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#6b6259'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 2600, ['#5f574e', '#776e62', '#554e45', '#827a6d'], 1, 4);
    ctx.fillStyle = 'rgba(40,36,30,0.25)';
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 12 + Math.random() * 26, 0, 7); ctx.fill(); }
  }, 14, 14);
  const std = (map, color, rough) => new THREE.MeshStandardMaterial({ map: map || null, color, roughness: rough === undefined ? 0.92 : rough, metalness: 0.04 });
  return [
    std(concrete, 0xffffff), std(null, PALETTE.dark, 0.95), std(metal, 0xd8c0a8),
    std(metal, 0xffffff, 0.6), std(crate, 0xffffff), std(ground, 0xffffff),
    new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.5, metalness: 0.2, emissive: PALETTE.teal, emissiveIntensity: 0.25 }),
    std(metal, 0xc96a3a, 0.7),
    std(crate, 0xffd9a0), std(crate, 0x9fd4cc),
  ];
}

function labelTexture(letter, accent, name) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const css = '#' + accent.toString(16).padStart(6, '0');
  ctx.fillStyle = 'rgba(20,26,32,0.88)'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = css; ctx.lineWidth = 10; ctx.strokeRect(8, 8, 240, 240);
  ctx.fillStyle = '#e8e4da'; ctx.font = 'bold 120px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, 128, 104);
  ctx.fillStyle = css; ctx.font = 'bold 30px sans-serif';
  ctx.fillText(name, 128, 198);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- build

export function buildMap(scene) {
  const mats = makeMaterials();
  const colliders = buildColliders(BOXES);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  for (const b of BOXES) {
    const mesh = new THREE.Mesh(b[7] === 'cyl' ? cylGeo : boxGeo, mats[b[6]]);
    mesh.scale.set(b[3], b[5], b[4]);
    mesh.position.set(b[0], b[1] + b[5] / 2, b[2]);
    mesh.castShadow = b[5] > 2;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), mats[5]);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // Gradient dusk sky dome: dark slate zenith, warm amber band at the
  // horizon. Visual only, fog-exempt so the gradient survives the haze.
  const skyC = document.createElement('canvas');
  skyC.width = 32; skyC.height = 256;
  const sctx = skyC.getContext('2d');
  const grad = sctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#1a2534');
  grad.addColorStop(0.30, '#35465a');
  grad.addColorStop(0.42, '#7a6a50');
  grad.addColorStop(0.47, '#e09a35');
  grad.addColorStop(0.52, '#96653c');
  grad.addColorStop(0.60, '#54432f');
  grad.addColorStop(1.0, '#33291e');
  sctx.fillStyle = grad; sctx.fillRect(0, 0, 32, 256);
  const skyTex = new THREE.CanvasTexture(skyC);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(150, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);
  // Bomb-site rings + floating signs. Each site carries its own accent
  // color (A amber, B teal) through ring, sign, lamps, and crates, so the
  // objective reads at a glance from anywhere on the map.
  const ringGeo = new THREE.RingGeometry(3.2, 3.7, 40);
  const rings = {};
  for (const key of Object.keys(SITES)) {
    const s = SITES[key];
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: s.accent, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.cx, 0.06, s.cz);
    scene.add(ring);
    rings[key] = ring;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshBasicMaterial({ map: labelTexture(key, s.accent, s.label.toUpperCase()), transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(s.cx, 4.6, s.cz);
    scene.add(sign);
  }
  // Lamp strips on poles + point lights. Site lamps glow in the site accent.
  const poleGeo = new THREE.BoxGeometry(0.12, 4.9, 0.12);
  const lampSpots = [[-19, -14, 'A'], [19, -14, 'B'], [0, 0, null], [0, 26, null]];
  for (const [x, z, site] of lampSpots) {
    const glow = site ? SITES[site].accent : PALETTE.lamp;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: glow }));
    strip.position.set(x, 4.9, z);
    scene.add(strip);
    for (const px of [x - 1, x + 1]) {
      const pole = new THREE.Mesh(poleGeo, mats[1]);
      pole.position.set(px, 2.45, z);
      scene.add(pole);
    }
    const light = new THREE.PointLight(glow, 55, 30, 1.7);
    light.position.set(x, 4.4, z);
    scene.add(light);
  }
  // Distant silhouettes outside the walls
  const silMat = new THREE.MeshBasicMaterial({ color: 0x1d2530 });
  const silhouettes = [[-48, -30, 14, 18], [48, -20, 12, 14], [-52, 20, 16, 12], [50, 30, 14, 20], [0, -52, 20, 10], [-20, 52, 18, 12], [30, 52, 12, 16], [-44, 44, 10, 10]];
  for (const [x, z, w, h] of silhouettes) {
    const m = new THREE.Mesh(boxGeo, silMat);
    m.scale.set(w, h, w);
    m.position.set(x, h / 2, z);
    scene.add(m);
  }
  for (const [x, z] of [[-40, -44], [42, -40]]) {
    const ch = new THREE.Mesh(cylGeo, silMat);
    ch.scale.set(3, 24, 3);
    ch.position.set(x, 12, z);
    scene.add(ch);
  }
  return { colliders, nav: buildNav(), rings };
}
