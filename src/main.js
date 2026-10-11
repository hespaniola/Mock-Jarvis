import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createDrone } from './scene/drone.js';
import { createArm, ARM_SHOULDER_H } from './scene/arm.js';
import { createMorph } from './scene/morph.js';
import { createEnvironment } from './scene/environment.js';
import { setFade, damp, clamp, smoothstep } from './scene/holo.js';
import { createHud } from './hud.js';

const CYAN = new THREE.Color(0x47e5ff);
const AMBER = new THREE.Color(0xffa63d);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const motion = reducedMotion ? 0.35 : 1;

setupPanels();

const canvas = document.getElementById('stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.documentElement.classList.add('no-webgl');
  console.warn('WebGL unavailable', err);
}

if (renderer) start(renderer);

function start(renderer) {
  const pixelRatio = Math.min(window.devicePixelRatio, 1.75);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02060c);
  scene.fog = new THREE.FogExp2(0x02060c, 0.04);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  const env = createEnvironment(CYAN);
  scene.add(env.world);

  // `stage` is where the hologram lives; layout moves/scales it per viewport.
  const stage = new THREE.Group();
  scene.add(stage);
  stage.add(env.pad);

  // drone.update() drives root position (bob/lean), so anchor it inside a home group.
  const drone = createDrone(CYAN);
  const droneHome = new THREE.Group();
  droneHome.position.y = 0.2;
  droneHome.scale.setScalar(1.35);
  droneHome.add(drone.root);
  stage.add(droneHome);

  const arm = createArm(AMBER);
  arm.root.position.y = -2.4;
  stage.add(arm.root);

  scene.updateMatrixWorld(true);
  const isSmall = window.innerWidth < 860;
  const morph = createMorph({ count: isSmall ? 9000 : 16000, from: drone.root, to: arm.root, colorA: CYAN, colorB: AMBER });
  morph.uniforms.uPixelRatio.value = pixelRatio;
  morph.uniforms.uMotion.value = motion;
  scene.add(morph.points);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.12);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const hud = createHud();
  if (window.matchMedia('(pointer: coarse)').matches) {
    document.querySelector('.hint-drone').textContent = 'SWIPE SIDEWAYS TO ROTATE · SCROLL TO RECONFIGURE';
    document.querySelector('.hint-arm').textContent = 'TOUCH TO GUIDE · HOLD TO GRIP';
  }

  // ---------- Layout ----------
  const layout = { camDist: 10.5, lookX: 0 };
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const wide = w >= 860 && w / h > 1.05;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);

    if (wide) {
      stage.position.set(1.9, 0, 0);
      stage.scale.setScalar(1);
      layout.camDist = 10.5;
      layout.lookX = 0;
    } else {
      // Portrait: centre the model in the upper part of the screen, panels sit below.
      stage.position.set(0, 0.9, 0);
      stage.scale.setScalar(clamp((w / h) * 1.25, 0.55, 0.9));
      layout.camDist = 11.5;
      layout.lookX = 0;
    }
    // Keep particle density on screen consistent when the stage shrinks.
    morph.uniforms.uSize.value = 28 * stage.scale.x;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Input ----------
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, ndc: new THREE.Vector2(), active: false, lastMove: -1e9 };
  let dragging = false;
  let gripping = false;
  let dragX = 0;
  let stageIsArm = false;

  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    pointer.active = true;
    pointer.lastMove = performance.now();
    document.body.classList.add('pointer-active');
    hud.moveReticle(e.clientX, e.clientY);
    if (dragging) {
      drone.drag(e.clientX - dragX);
      dragX = e.clientX;
    }
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (stageIsArm) {
      gripping = true;
      // Touch has no hover, so a press also sets the target.
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      pointer.active = true;
      pointer.lastMove = performance.now();
      document.body.classList.add('gripping');
    } else {
      dragging = true;
      dragX = e.clientX;
      document.body.classList.add('dragging');
    }
  });
  const release = () => {
    dragging = false;
    gripping = false;
    document.body.classList.remove('dragging', 'gripping');
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);

  // ---------- Scroll → morph progress ----------
  const morphZone = document.getElementById('morph');
  function scrollProgress() {
    const r = morphZone.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    return clamp(-r.top / span, 0, 1);
  }
  let progress = scrollProgress();

  const navLinks = [...document.querySelectorAll('.stage-nav a')];
  const sections = [...document.querySelectorAll('main section[data-section]')];
  function updateNav() {
    const mid = window.innerHeight * 0.5;
    let active = progress >= 0.5 ? 'code' : 'visuals';
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      if (r.top < mid && r.bottom > mid) active = s.dataset.section;
    }
    for (const a of navLinks) a.classList.toggle('active', a.dataset.section === active);
  }

  // ---------- Frame loop ----------
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const stageCenter = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const armTarget = new THREE.Vector3(0, 2, 1.6);
  const idleTarget = new THREE.Vector3();
  const aim = { x: 0, y: 0 };
  const envColor = new THREE.Color();

  function frame() {
    const dt = Math.min(clock.getDelta(), 1 / 20);
    const t = clock.elapsedTime;
    const now = performance.now();

    // Scrubbing: lightly smoothed so wheel steps don't stutter, but always tracks scroll exactly.
    const target = scrollProgress();
    progress = damp(progress, target, 14, dt);
    if (Math.abs(progress - target) < 1e-4) progress = target;
    const p = progress;
    const burst = Math.sin(p * Math.PI);
    stageIsArm = p >= 0.5;
    if (stageIsArm && dragging) release();

    const pointerLive = pointer.active && now - pointer.lastMove < 6000;

    // Drone: tilt toward cursor relative to its on-screen position
    droneHome.getWorldPosition(tmp).project(camera);
    const sx = (tmp.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
    const ax = pointerLive ? clamp((pointer.x - sx) / (window.innerWidth * 0.5), -1, 1) : 0;
    const ay = pointerLive ? clamp(-(pointer.y - sy) / (window.innerHeight * 0.5), -1, 1) : 0;
    aim.x = damp(aim.x, ax, 5, dt);
    aim.y = damp(aim.y, ay, 5, dt);
    drone.update(dt, t, { aim, dragging, motion });

    // Arm: fingertips follow the cursor projected onto a plane in front of the arm
    arm.root.getWorldPosition(tmp);
    const reachZ = 1.6;
    if (pointerLive) {
      plane.constant = -(tmp.z + reachZ * stage.scale.z);
      raycaster.setFromCamera(pointer.ndc, camera);
      if (raycaster.ray.intersectPlane(plane, idleTarget)) {
        arm.root.worldToLocal(idleTarget);
        armTarget.copy(idleTarget);
      }
    } else {
      armTarget.set(Math.sin(t * 0.55) * 2.2, ARM_SHOULDER_H + 1.3 + Math.sin(t * 0.9) * 0.9, reachZ);
    }
    armTarget.y = Math.max(armTarget.y, 0.35);
    arm.update(dt, armTarget, { gripClosed: gripping });

    // Visibility across the morph
    const droneFade = 1 - smoothstep(0, 0.14, p);
    const armFade = smoothstep(0.86, 1, p);
    const flicker = () => (reducedMotion ? 1 : 0.7 + Math.random() * 0.3);
    setFade(drone.materialSets, droneFade * (droneFade < 1 ? flicker() : 1));
    setFade(arm.materialSets, armFade * (armFade > 0 && armFade < 1 ? flicker() : 1));
    drone.root.visible = droneFade > 0.001;
    arm.root.visible = armFade > 0.001;
    drone.root.scale.setScalar(1 + (1 - droneFade) * 0.06);
    arm.root.scale.setScalar(0.94 + armFade * 0.06);

    // Camera: slight pointer parallax + push-in mid-morph
    stage.localToWorld(stageCenter.set(0, -0.3, 0));
    camPos.set(layout.lookX + pointer.ndc.x * 0.25 * motion, 0.6 + pointer.ndc.y * 0.15 * motion, layout.camDist);
    lookAt.set(layout.lookX, 0, 0);
    camPos.lerp(stageCenter, 0.24 * burst);
    lookAt.lerp(stageCenter, 0.35 * burst);
    if (!reducedMotion && burst > 0.6) {
      const shake = (burst - 0.6) * 0.04;
      camPos.x += (Math.random() - 0.5) * shake;
      camPos.y += (Math.random() - 0.5) * shake;
    }
    camera.position.copy(camPos);
    camera.lookAt(lookAt);

    // Particles
    scene.updateMatrixWorld();
    const morphing = p > 0.0005 && p < 0.9995;
    morph.points.visible = morphing;
    if (morphing) {
      morph.sync();
      morph.uniforms.uProgress.value = p;
      morph.uniforms.uTime.value = t;
      morph.uniforms.uCenter.value.copy(stageCenter);
      morph.uniforms.uOpacity.value = smoothstep(0, 0.04, p) * (1 - smoothstep(0.96, 1, p));
    }

    // Bloom pulse, peaking at the midpoint
    bloom.strength = 0.7 + (0.6 * burst * burst + 0.2 * burst * (0.5 + 0.5 * Math.sin(t * 9))) * (reducedMotion ? 0.5 : 1);
    bloom.radius = 0.5 + 0.2 * burst;

    envColor.copy(CYAN).lerp(AMBER, smoothstep(0.35, 0.65, p));
    env.setColor(envColor);
    env.materials.cone.uniforms.uStrength.value = 0.03 + 0.04 * burst;
    env.update(dt, t);

    hud.update(now, p, { drone: drone.readout(), arm: arm.readout() });
    updateNav();

    composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Panels slide in as their section enters, and back out when it leaves.
function setupPanels() {
  const panels = document.querySelectorAll('.panel');
  if (!('IntersectionObserver' in window)) {
    panels.forEach((p) => p.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.target.classList.toggle('in', e.isIntersecting);
    },
    { threshold: 0.2 },
  );
  panels.forEach((p) => io.observe(p));
}
