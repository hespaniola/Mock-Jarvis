import { smoothstep } from './scene/holo.js';

const $ = (id) => document.getElementById(id);

const PHASES = [
  [0.0, 'DECOMPILING CHASSIS'],
  [0.22, 'RELEASING ROTOR ASSEMBLY'],
  [0.42, 'PARTICLE FIELD UNSTABLE'],
  [0.6, 'ROUTING ACTUATORS'],
  [0.8, 'CALIBRATING JOINTS'],
];

const fmt = (v, digits = 1, pad = 6) => (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(digits).padStart(pad - 1, '0');

export function createHud() {
  const body = document.body;
  const reconfig = $('reconfig');
  const fill = $('reconfig-fill');
  const pct = $('reconfig-pct');
  const phase = $('reconfig-phase');
  const teleUnit = $('tele-unit');
  const teleMode = $('tele-mode');
  const teleRows = $('tele-rows');
  const clock = $('hud-clock');
  const sys = $('hud-sys');
  const reticle = $('reticle');

  let lastTele = 0;
  let lastPhase = '';
  let stage = '';

  function rows(pairs) {
    teleRows.innerHTML = pairs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  return {
    // progress: 0..1 morph position
    update(now, progress, telemetry) {
      const show = smoothstep(0.02, 0.12, progress) * (1 - smoothstep(0.88, 0.98, progress));
      reconfig.style.opacity = show.toFixed(3);
      reconfig.style.visibility = show > 0.001 ? 'visible' : 'hidden';
      if (show > 0.001) {
        fill.style.width = `${(progress * 100).toFixed(1)}%`;
        pct.textContent = `${String(Math.round(progress * 100)).padStart(3, '0')}%`;
        let label = PHASES[0][1];
        for (const [at, text] of PHASES) if (progress >= at) label = text;
        if (label !== lastPhase) {
          phase.textContent = label;
          lastPhase = label;
        }
        // Brief glitch flicker, strongest at the midpoint
        reconfig.classList.toggle('glitch', Math.random() < 0.08 * Math.sin(progress * Math.PI));
      }

      const nextStage = progress < 0.5 ? 'drone' : 'arm';
      if (nextStage !== stage) {
        stage = nextStage;
        body.classList.toggle('stage-arm', stage === 'arm');
        teleUnit.textContent = stage === 'arm' ? 'UNIT MK-IV · MANIPULATOR' : 'UNIT MK-II · AERIAL DRONE';
        lastTele = 0;
      }

      if (now - lastTele > 100) {
        lastTele = now;
        const morphing = progress > 0.001 && progress < 0.999;
        teleMode.textContent = morphing ? 'MODE: RECONFIGURING' : stage === 'arm' ? 'MODE: TRACKING' : 'MODE: HOVER';
        sys.textContent = morphing ? 'REBUILDING' : 'SYS ONLINE';
        if (stage === 'drone') {
          const d = telemetry.drone;
          rows([
            ['ROTOR RPM', (12000 + Math.round(Math.sin(now / 900) * 300 + Math.random() * 60)).toLocaleString('en-US')],
            ['ALT', `${d.alt.toFixed(2)} M`],
            ['YAW', `${d.yaw.toFixed(1).padStart(5, '0')}°`],
            ['PITCH', `${fmt(d.pitch)}°`],
            ['ROLL', `${fmt(d.roll)}°`],
          ]);
        } else {
          const a = telemetry.arm;
          rows([
            ['J1 BASE', `${fmt(a.j1)}°`],
            ['J2 SHOULDER', `${fmt(a.j2)}°`],
            ['J3 ELBOW', `${fmt(a.j3)}°`],
            ['J4 WRIST', `${fmt(a.j4)}°`],
            ['GRIP', a.grip > 0.5 ? 'CLOSED' : 'OPEN'],
          ]);
        }
        const d = new Date();
        clock.textContent = d.toTimeString().slice(0, 8);
      }
    },
    moveReticle(x, y) {
      reticle.style.transform = `translate(${x}px, ${y}px)`;
    },
  };
}
