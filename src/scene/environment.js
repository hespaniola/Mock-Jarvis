import * as THREE from 'three';
import { ringSegments } from './holo.js';

// Floor grid, projector pad under the hologram, and drifting dust.
export function createEnvironment(color) {
  const world = new THREE.Group();

  const grid = new THREE.GridHelper(40, 80, 0xffffff, 0xffffff);
  grid.material.color.set(color);
  grid.material.transparent = true;
  grid.material.opacity = 0.07;
  grid.material.depthWrite = false;
  grid.position.y = -2.4;
  world.add(grid);

  const dustCount = 700;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 30;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 14;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 20 - 3;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color,
      size: 0.035,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  world.add(dust);

  // Projector pad: lives in stage space so it follows the hologram layout.
  const pad = new THREE.Group();
  pad.position.y = -2.4;
  const padMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rings = [1.4, 1.75, 2.3].map((r, i) => {
    const ring = ringSegments(r, 96 - i * 16, padMat);
    pad.add(ring);
    return ring;
  });
  // Dashed outer ring
  const dashPts = [];
  for (let i = 0; i < 48; i += 2) {
    const a0 = (i / 48) * Math.PI * 2;
    const a1 = ((i + 0.8) / 48) * Math.PI * 2;
    dashPts.push(Math.cos(a0) * 2.7, 0, Math.sin(a0) * 2.7, Math.cos(a1) * 2.7, 0, Math.sin(a1) * 2.7);
  }
  const dashGeo = new THREE.BufferGeometry();
  dashGeo.setAttribute('position', new THREE.Float32BufferAttribute(dashPts, 3));
  const dashes = new THREE.LineSegments(dashGeo, padMat);
  pad.add(dashes);

  // Faint projection cone
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 2.3, 4.6, 48, 1, true),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: 0.03 } },
      vertexShader: `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vY; void main(){ gl_FragColor = vec4(uColor, (1.0 - vY) * uStrength); }`,
    }),
  );
  cone.position.y = 2.3;
  pad.add(cone);

  return {
    world,
    pad,
    materials: { padMat, cone: cone.material, grid: grid.material, dust: dust.material },
    update(dt, t) {
      rings[0].rotation.y += dt * 0.3;
      rings[2].rotation.y -= dt * 0.12;
      dashes.rotation.y += dt * 0.08;
      dust.rotation.y = t * 0.01;
      dust.position.y = Math.sin(t * 0.2) * 0.2;
    },
    setColor(c) {
      padMat.color.copy(c);
      cone.material.uniforms.uColor.value.copy(c);
      grid.material.color.copy(c);
      dust.material.color.copy(c);
    },
  };
}
