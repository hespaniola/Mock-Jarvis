# Mock-Jarvis
I'm just playing around with some Claude code stuff and seeing what works.

## Holographic drone → arm site

A single-page site built with three.js and Vite. A wireframe drone hologram turns into a robotic arm as you scroll.

- **Drone (Visuals):** hovers with spinning rotors and a gentle bob. Drag it to spin it. It tilts toward the cursor.
- **Morph:** the scroll position inside `#morph` sets the morph progress, so you can scrub it forwards and backwards. Each frame, about 16k particles are re-sampled from the edges of both live models. They swirl in a vortex and then reassemble. A bloom pulse, a camera push-in and a `RECONFIGURING...` HUD peak at the midpoint.
- **Arm (Code / Robotics):** an inverse-kinematics solver aims the base, shoulder, elbow and wrist so the fingertips follow the cursor. Press and hold to close the gripper.

```sh
npm install
npm run dev      # local dev server
npm run build    # static output in dist/ (deploys as-is to Vercel/Netlify)
```

Code map: `src/main.js` (render loop, scroll, input, camera, bloom), `src/scene/drone.js`, `src/scene/arm.js` (IK), `src/scene/morph.js` (particle shader), `src/scene/environment.js`, `src/hud.js`.
