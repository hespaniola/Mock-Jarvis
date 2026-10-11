import * as THREE from 'three';

// Distributes `count` points across every LineSegments edge under `root`, weighted by
// edge length. Points are stored in each line's local space so they can be re-projected
// through the live matrixWorld every frame — particles stay glued to the moving model.
function buildSampler(root, count) {
  root.updateMatrixWorld(true);
  const objects = [];
  const segs = [];
  let total = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  root.traverse((o) => {
    if (!o.isLineSegments) return;
    const oi = objects.push(o) - 1;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i + 1 < pos.count; i += 2) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      const len = a.clone().applyMatrix4(o.matrixWorld).distanceTo(b.clone().applyMatrix4(o.matrixWorld));
      if (len <= 1e-5) continue;
      total += len;
      segs.push({ oi, ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, cum: total });
    }
  });

  const owner = new Uint16Array(count);
  const local = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = Math.random() * total;
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].cum < r) lo = mid + 1;
      else hi = mid;
    }
    const s = segs[lo];
    const t = Math.random();
    owner[i] = s.oi;
    local[i * 3] = s.ax + (s.bx - s.ax) * t;
    local[i * 3 + 1] = s.ay + (s.by - s.ay) * t;
    local[i * 3 + 2] = s.az + (s.bz - s.az) * t;
  }

  return {
    write(out) {
      for (let i = 0; i < count; i++) {
        const e = objects[owner[i]].matrixWorld.elements;
        const x = local[i * 3];
        const y = local[i * 3 + 1];
        const z = local[i * 3 + 2];
        out[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        out[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        out[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
    },
  };
}

const vertexShader = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aRand;
  uniform float uProgress;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uMotion;
  uniform vec3 uCenter;
  varying float vMix;
  varying float vHeat;

  void main() {
    // Each particle runs its own staggered 0..1 timeline inside the global progress.
    float tp = clamp((uProgress - aRand * 0.28) / 0.72, 0.0, 1.0);
    float e = tp * tp * tp * (tp * (tp * 6.0 - 15.0) + 10.0);
    float burst = sin(tp * 3.14159265);

    vec3 rel = mix(aStart, aEnd, e) - uCenter;

    // Vortex: spin around the vertical axis and fling outward mid-flight.
    float ang = burst * (2.4 + aRand * 3.6) * (aRand > 0.5 ? 1.0 : -0.7);
    float s = sin(ang);
    float c = cos(ang);
    rel.xz = mat2(c, -s, s, c) * rel.xz;
    rel.xz *= 1.0 + burst * (0.15 + aRand * 0.5);
    rel.y += burst * sin(aRand * 57.0 + uTime * 1.4) * 0.5;

    // Turbulence
    rel += burst * uMotion * 0.38 * vec3(
      sin(uTime * 2.1 + aRand * 91.0),
      cos(uTime * 1.7 + aRand * 37.0),
      sin(uTime * 1.3 + aRand * 13.0)
    );

    vec4 mv = modelViewMatrix * vec4(uCenter + rel, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(uSize * (1.0 + burst * 0.6) * (0.55 + aRand * 0.9) * uPixelRatio / -mv.z, 7.0 * uPixelRatio);

    vMix = e;
    vHeat = burst;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorHot;
  uniform float uOpacity;
  varying float vMix;
  varying float vHeat;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    vec3 col = mix(uColorA, uColorB, vMix);
    col = mix(col, uColorHot, vHeat * 0.25);
    gl_FragColor = vec4(col * (1.0 + vHeat * 0.4), a * uOpacity * (0.5 - vHeat * 0.32));
  }
`;

export function createMorph({ count, from, to, colorA, colorB }) {
  const startSampler = buildSampler(from, count);
  const endSampler = buildSampler(to, count);

  const geometry = new THREE.BufferGeometry();
  const aStart = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aEnd = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const rand = new Float32Array(count);
  for (let i = 0; i < count; i++) rand[i] = Math.random();
  geometry.setAttribute('position', aStart); // draw count + required attribute
  geometry.setAttribute('aStart', aStart);
  geometry.setAttribute('aEnd', aEnd);
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 28 },
      uPixelRatio: { value: 1 },
      uMotion: { value: 1 },
      uOpacity: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uColorHot: { value: new THREE.Color(0xffffff) },
    },
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;

  return {
    points,
    uniforms: material.uniforms,
    // Re-sample both models' current poses. Call after updateMatrixWorld.
    sync() {
      startSampler.write(aStart.array);
      endSampler.write(aEnd.array);
      aStart.needsUpdate = true;
      aEnd.needsUpdate = true;
    },
  };
}
