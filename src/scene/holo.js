import * as THREE from 'three';

// Additive line + faint fill materials give the wireframe-hologram look.
// `opacity` on each material is the "full strength" value; setFade() scales it.
export function holoMaterials(color, strength = 1) {
  const line = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9 * strength,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const fill = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.05 * strength,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  line.userData.base = line.opacity;
  fill.userData.base = fill.opacity;
  return { line, fill, list: [line, fill] };
}

export function setFade(materialSets, fade) {
  for (const set of materialSets) {
    for (const m of set.list) m.opacity = m.userData.base * fade;
  }
}

// Edge lines (sampled by the morph) plus an optional translucent body.
export function holoPart(geometry, mats, { fill = true, threshold = 15 } = {}) {
  const group = new THREE.Group();
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, threshold), mats.line));
  if (fill) group.add(new THREE.Mesh(geometry, mats.fill));
  return group;
}

export function ringSegments(radius, count, mat) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = ((i + 1) / count) * Math.PI * 2;
    pts.push(Math.cos(a0) * radius, 0, Math.sin(a0) * radius);
    pts.push(Math.cos(a1) * radius, 0, Math.sin(a1) * radius);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(g, mat);
}

export function place(obj, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, rz);
  return obj;
}

// Frame-rate independent exponential smoothing.
export function damp(a, b, lambda, dt) {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
