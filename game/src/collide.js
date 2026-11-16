// Axis-aligned collision: movement resolution, raycasts, line of sight.
// Colliders are flat [minX, minY, minZ, maxX, maxY, maxZ] arrays. No allocation
// in any hot path: all working values are locals.
export function buildColliders(boxes) {
  const out = new Array(boxes.length);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    out[i] = [b[0] - b[3] / 2, b[1], b[2] - b[4] / 2, b[0] + b[3] / 2, b[1] + b[5], b[2] + b[4] / 2];
  }
  return out;
}

/** Move a feet-centred body, axis by axis. Mutates p. Returns ground contact. */
export function moveBody(cols, p, v, dt, half, height) {
  let ground = false;
  // X axis
  p.x += v.x * dt;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (p.x + half > c[0] && p.x - half < c[3] && p.y + height > c[1] && p.y < c[4] && p.z + half > c[2] && p.z - half < c[5]) {
      if (v.x > 0) p.x = c[0] - half; else if (v.x < 0) p.x = c[3] + half;
      v.x = 0;
    }
  }
  // Z axis
  p.z += v.z * dt;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (p.x + half > c[0] && p.x - half < c[3] && p.y + height > c[1] && p.y < c[4] && p.z + half > c[2] && p.z - half < c[5]) {
      if (v.z > 0) p.z = c[2] - half; else if (v.z < 0) p.z = c[5] + half;
      v.z = 0;
    }
  }
  // Y axis
  p.y += v.y * dt;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (p.x + half > c[0] && p.x - half < c[3] && p.y + height > c[1] && p.y < c[4] && p.z + half > c[2] && p.z - half < c[5]) {
      if (v.y <= 0) { p.y = c[4]; ground = true; }
      else p.y = c[1] - height;
      v.y = 0;
    }
  }
  if (p.y < 0) { p.y = 0; v.y = 0; ground = true; }
  return ground;
}

/** Slab raycast against the world. Returns nearest hit distance or Infinity. */
export function rayWorld(cols, ox, oy, oz, dx, dy, dz, maxD) {
  let best = Infinity;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    let tmin = 0, tmax = maxD, ok = true;
    // X slab
    if (dx === 0) { if (ox < c[0] || ox > c[3]) ok = false; }
    else {
      let t1 = (c[0] - ox) / dx, t2 = (c[3] - ox) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) ok = false;
    }
    if (ok) {
      if (dy === 0) { if (oy < c[1] || oy > c[4]) ok = false; }
      else {
        let t1 = (c[1] - oy) / dy, t2 = (c[4] - oy) / dy;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) ok = false;
      }
    }
    if (ok) {
      if (dz === 0) { if (oz < c[2] || oz > c[5]) ok = false; }
      else {
        let t1 = (c[2] - oz) / dz, t2 = (c[5] - oz) / dz;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) ok = false;
      }
    }
    if (ok && tmin < best) best = tmin;
  }
  return best;
}

/** True when the segment between two points touches no collider. */
export function losClear(cols, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 0.001) return true;
  const t = rayWorld(cols, ax, ay, az, dx / d, dy / d, dz / d, d);
  return t >= d - 0.05;
}
