import * as THREE from 'three';
import { holoMaterials, holoPart, ringSegments, place, damp, clamp } from './holo.js';

// Quadcopter hologram. Hierarchy: root (bob) → tilt (lean toward cursor) → yaw (drag spin).
export function createDrone(color) {
  const mats = holoMaterials(color);
  const faint = holoMaterials(color, 0.35);
  const materialSets = [mats, faint];

  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const yaw = new THREE.Group();
  root.add(tilt);
  tilt.add(yaw);

  // Fuselage
  yaw.add(holoPart(new THREE.CylinderGeometry(0.55, 0.72, 0.3, 8), mats));
  const dome = holoPart(new THREE.SphereGeometry(0.46, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), mats);
  dome.scale.y = 0.55;
  yaw.add(place(dome, 0, 0.15, 0));
  yaw.add(place(holoPart(new THREE.CylinderGeometry(0.72, 0.5, 0.14, 8), mats), 0, -0.22, 0));

  // Camera gimbal
  yaw.add(place(holoPart(new THREE.IcosahedronGeometry(0.17, 1), mats), 0, -0.45, 0));
  yaw.add(place(holoPart(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 10), mats), 0, -0.45, 0.17, Math.PI / 2));

  // Arms, motors, rotors
  const rotors = [];
  for (let i = 0; i < 4; i++) {
    const armGroup = new THREE.Group();
    armGroup.rotation.y = Math.PI / 4 + (i * Math.PI) / 2;
    yaw.add(armGroup);

    armGroup.add(place(holoPart(new THREE.BoxGeometry(0.11, 0.07, 1.05), mats), 0, 0, 0.975));
    armGroup.add(place(holoPart(new THREE.CylinderGeometry(0.15, 0.17, 0.2, 10), mats), 0, 0.04, 1.5));
    armGroup.add(place(holoPart(new THREE.OctahedronGeometry(0.045), mats, { fill: false }), 0, -0.1, 1.5));

    const rotor = new THREE.Group();
    rotor.position.set(0, 0.2, 1.5);
    rotor.add(holoPart(new THREE.BoxGeometry(1.05, 0.012, 0.08), mats));
    rotor.add(place(holoPart(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), mats), 0, 0, 0));
    // Motion-blur discs: a ring per blade tip plus an inner one
    rotor.add(ringSegments(0.54, 48, faint.line));
    rotor.add(place(ringSegments(0.36, 36, faint.line), 0, 0.005, 0));
    armGroup.add(rotor);
    rotors.push({ group: rotor, dir: i % 2 ? 1 : -1 });
  }

  // Landing skids
  for (const s of [-1, 1]) {
    yaw.add(place(holoPart(new THREE.BoxGeometry(0.05, 0.05, 1.3), mats), s * 0.5, -0.58, 0));
    for (const z of [-0.35, 0.35]) {
      yaw.add(place(holoPart(new THREE.BoxGeometry(0.04, 0.34, 0.04), mats, { fill: false }), s * 0.44, -0.42, z, 0, 0, s * 0.35));
    }
  }

  // Antenna
  yaw.add(place(holoPart(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), mats, { fill: false }), -0.2, 0.42, -0.25, 0, 0, 0.25));

  const state = { spin: 0.6, spinVel: 0, tiltX: 0, tiltZ: 0, leanX: 0, leanY: 0, rotorSpeed: 32 };

  return {
    root,
    materialSets,
    state,
    drag(dx) {
      state.spinVel = clamp(state.spinVel + dx * 0.012, -14, 14);
    },
    // aim: cursor offset from the drone on screen, roughly -1..1
    update(dt, t, { aim, dragging, motion = 1 }) {
      if (!dragging) state.spinVel = damp(state.spinVel, 0.25, 1.6, dt);
      state.spin += state.spinVel * dt;
      yaw.rotation.y = state.spin;

      state.tiltX = damp(state.tiltX, -aim.y * 0.38, 4, dt);
      state.tiltZ = damp(state.tiltZ, -aim.x * 0.38, 4, dt);
      state.leanX = damp(state.leanX, aim.x * 0.25, 3, dt);
      state.leanY = damp(state.leanY, aim.y * 0.15, 3, dt);
      tilt.rotation.x = state.tiltX + Math.sin(t * 1.3) * 0.03 * motion;
      tilt.rotation.z = state.tiltZ + Math.sin(t * 0.9 + 1) * 0.04 * motion;

      root.position.x = state.leanX;
      root.position.y = state.leanY + Math.sin(t * 1.6) * 0.12 * motion;

      for (const r of rotors) r.group.rotation.y += r.dir * state.rotorSpeed * dt;
    },
    readout() {
      const deg = ((THREE.MathUtils.radToDeg(state.spin) % 360) + 360) % 360;
      return {
        yaw: deg,
        pitch: THREE.MathUtils.radToDeg(state.tiltX),
        roll: THREE.MathUtils.radToDeg(state.tiltZ),
        alt: 1.2 + root.position.y,
      };
    },
  };
}
