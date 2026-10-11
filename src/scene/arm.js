import * as THREE from 'three';
import { holoMaterials, holoPart, ringSegments, place, damp, clamp } from './holo.js';

// Link lengths (pivot to pivot). Every link is modelled along its local +Y,
// and every pitch joint rotates about local X, so +angle leans the link forward (+Z).
const SHOULDER_H = 0.8;
const L1 = 1.55; // shoulder → elbow
const L2 = 1.35; // elbow → wrist
const L3 = 0.5; // wrist → fingertips
export const ARM_REACH = L1 + L2 + L3;
export const ARM_SHOULDER_H = SHOULDER_H;

export function createArm(color) {
  const mats = holoMaterials(color);
  const faint = holoMaterials(color, 0.4);
  const materialSets = [mats, faint];

  const root = new THREE.Group();

  // Pedestal
  root.add(place(holoPart(new THREE.CylinderGeometry(0.8, 0.95, 0.22, 16), mats), 0, 0.11, 0));
  root.add(place(ringSegments(1.15, 64, faint.line), 0, 0.01, 0));

  // J1: base yaw
  const turret = new THREE.Group();
  turret.position.y = 0.22;
  root.add(turret);
  turret.add(place(holoPart(new THREE.CylinderGeometry(0.42, 0.55, 0.4, 12), mats), 0, 0.2, 0));
  turret.add(place(holoPart(new THREE.BoxGeometry(0.18, 0.5, 0.5), mats), -0.3, 0.45, 0));
  turret.add(place(holoPart(new THREE.BoxGeometry(0.18, 0.5, 0.5), mats), 0.3, 0.45, 0));

  // J2: shoulder pitch
  const shoulder = new THREE.Group();
  shoulder.position.y = SHOULDER_H - 0.22;
  turret.add(shoulder);
  shoulder.add(place(holoPart(new THREE.CylinderGeometry(0.24, 0.24, 0.46, 14), mats), 0, 0, 0, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) {
    shoulder.add(place(holoPart(new THREE.BoxGeometry(0.06, L1, 0.3), mats), s * 0.17, L1 / 2, 0));
  }
  shoulder.add(place(holoPart(new THREE.BoxGeometry(0.14, L1 * 0.7, 0.14), mats, { fill: false }), 0, L1 / 2, 0));

  // J3: elbow pitch
  const elbow = new THREE.Group();
  elbow.position.y = L1;
  shoulder.add(elbow);
  elbow.add(place(holoPart(new THREE.CylinderGeometry(0.19, 0.19, 0.42, 14), mats), 0, 0, 0, 0, 0, Math.PI / 2));
  elbow.add(place(holoPart(new THREE.CylinderGeometry(0.1, 0.14, L2, 8), mats), 0, L2 / 2, 0));
  elbow.add(place(holoPart(new THREE.BoxGeometry(0.22, 0.3, 0.22), mats), 0, 0.3, 0));

  // J4: wrist pitch
  const wrist = new THREE.Group();
  wrist.position.y = L2;
  elbow.add(wrist);
  wrist.add(place(holoPart(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 12), mats), 0, 0, 0, 0, 0, Math.PI / 2));
  wrist.add(place(holoPart(new THREE.BoxGeometry(0.34, 0.1, 0.2), mats), 0, 0.12, 0));

  // Gripper fingers
  const fingers = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Group();
    f.position.set(s * 0.12, 0.16, 0);
    f.add(place(holoPart(new THREE.BoxGeometry(0.05, 0.24, 0.12), mats), 0, 0.12, 0));
    f.add(place(holoPart(new THREE.BoxGeometry(0.05, 0.12, 0.1), mats), -s * 0.03, 0.29, 0, 0, 0, s * 0.35));
    wrist.add(f);
    fingers.push({ group: f, side: s });
  }

  const j = { yaw: 0, a1: 0.3, a2: 0.9, a3: 0.6, grip: 0 };

  return {
    root,
    materialSets,
    // target: point in root-local space the fingertips should reach
    update(dt, target, { gripClosed = false } = {}) {
      const yaw = Math.atan2(target.x, target.z);
      const d = Math.hypot(target.x, target.z);
      const h = target.y - SHOULDER_H;

      // Gripper approaches along the shoulder→target line, dipped slightly downward.
      const approach = clamp(Math.atan2(d, h) + 0.25, 0.15, 2.7);
      const wu = d - Math.sin(approach) * L3;
      const wv = h - Math.cos(approach) * L3;

      const dist = clamp(Math.hypot(wu, wv), 0.35, L1 + L2 - 1e-3);
      const a2 = Math.acos(clamp((dist * dist - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1));
      const a1 = Math.atan2(wu, wv) - Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
      const a3 = approach - a1 - a2;

      j.yaw = damp(j.yaw, yaw, 7, dt);
      j.a1 = damp(j.a1, a1, 7, dt);
      j.a2 = damp(j.a2, a2, 7, dt);
      j.a3 = damp(j.a3, a3, 9, dt);
      j.grip = damp(j.grip, gripClosed ? 1 : 0, 12, dt);

      turret.rotation.y = j.yaw;
      shoulder.rotation.x = j.a1;
      elbow.rotation.x = j.a2;
      wrist.rotation.x = j.a3;
      for (const f of fingers) f.group.position.x = f.side * (0.13 - j.grip * 0.07);
    },
    readout() {
      const deg = THREE.MathUtils.radToDeg;
      return { j1: deg(j.yaw), j2: deg(j.a1), j3: deg(j.a2), j4: deg(j.a3), grip: j.grip };
    },
  };
}
