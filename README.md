<<<<<<< HEAD
# john-middlehurst-portfolio
Portfolio website
=======
# John Middlehurst — Interactive Portfolio

A creative portfolio site with:

- A **WebGPU fluid simulation + GPGPU morphing particles** for the hero scene (adapted from the `three-fluid-fx` "Mega Demo").
- A **WebGL particle tunnel** for the about scene, where the cursor steers the vanishing end.
- A custom **snap-scroll controller** with choreographed GSAP transitions between sections — outgoing text slides off, backgrounds cross-fade, incoming text slides in.
- An on-demand **Tweakpane** for live-tuning the fluid scene — hidden by default, toggle with the backtick (\` / ~) key.
- A graceful **fallback** to the original procedural smoke-vortex shader on browsers without WebGPU support.

## Stack

- **No build step.** Everything is ES modules loaded over CDN, plus a few small vendor files from the `three-fluid-fx` example repo. There is no `package.json`, no bundler.
- **Three.js r183** (via `esm.sh`).
- **`three-fluid-fx@0.1.0/tsl`** (via `esm.sh`, with `three` externalised so it shares our copy).
- **GSAP 3.12.5** for transitions.
- **Tweakpane 4** for the live controls panel.
- **Google Fonts**: Space Grotesk (display), Inter (body).

## Browser requirements

- The **hero scene** needs WebGPU. As of 2026, this is supported in Chrome/Edge (since 2023), Safari 18.4+ (macOS) / Safari 26+ (iOS), and Firefox 141+.
- If WebGPU is unavailable, the hero gracefully falls back to the original procedural vortex shader on the WebGL canvas. Everything else works the same.

## Running locally

```bash
node serve.js
# or pick a port
node serve.js 8080
```

Then open <http://localhost:5173>. The mini server sends `Cache-Control: no-store` so reloads always fetch fresh code.

You can also use any other static server (`python -m http.server`, etc.) — but it must serve `.js` files with a JavaScript MIME type.

## Project structure

```
john-middlehurst-portfolio/
├── index.html              Markup + import map
├── styles.css              Layout, typography, canvas stacking, Tweakpane styles
├── serve.js                Zero-dep static file server
├── js/
│   ├── main.js             Bootstrap: instantiates everything, RAF loop, pointer tracking
│   ├── fluid.js            FluidScene (WebGPU + TSL): mega-demo adaptation
│   ├── tweakpane-controls.js  Tweakpane GUI; toggled with `
│   ├── particles.js        ParticleSystem (WebGL): tunnel particles + vortex fallback
│   ├── vortex.js           VortexEffect (WebGL fragment shader): hero fallback
│   ├── scroll.js           SnapScroll: wheel/touch/key input -> GSAP timelines
│   └── vendor/
│       └── three-fluid-fx-extras/      (vendored from the example repo;
│           ├── extras/                  these are not in the npm package)
│           │   ├── backgrounds/tsl/Backdrop.js
│           │   ├── particles/tsl/MorphFlowParticles.js
│           │   ├── particles/tsl/WGSLFlowParticles.js
│           │   ├── controls/createControlsPane.js
│           │   ├── controls/paramRanges.js
│           │   └── resolveProfile.js
│           └── tsl/shared/nodeInterop.js
└── README.md
```

## Architecture

Two canvases are stacked in `index.html`:

| Layer | Element | Renderer | Used for |
|---|---|---|---|
| Bottom (z=0) | `#bg-canvas` | WebGL | Tunnel particles (about scene). Also hosts the vortex fallback when WebGPU isn't supported. |
| Top (z=1)    | `#fluid-canvas` | WebGPU | Fluid + morph particles (hero scene). Hidden if WebGPU unavailable. |

`main.js` owns both. As the user scrolls between sections, `scroll.js` tweens a single `transitionT` value (0 = hero, 1 = about). That value:
- Sets the **tunnel particle opacity** (uniform on the particle shader) on the WebGL canvas.
- Sets the **fluid canvas CSS opacity** (cross-fade between hero fluid and about tunnel).
- Triggers the GSAP text-slide animations on each section's text block.

The WebGL renderer is `alpha: true` so when the tunnel is fading in, the fluid below shows through.

The fluid scene drives itself via a fixed-timestep Navier-Stokes simulator with up to 4 substeps per frame and `BFECC` advection. Post-processing applies a configurable overlay (default **Art Ink**) and screen distortion (default **Simple**) before output.

## The Tweakpane

Press the **\`** (backtick) key anywhere on the page to slide the Tweakpane in/out from the right.

Sections from top to bottom:

- **Layers** — enable/disable each layer (particles, morph, overlay, distortion).
- **Splat** — radius and force of the dye drops the cursor paints into the velocity field.
- **Fluid sim** — Navier-Stokes parameters: pressure iterations, curl, dissipation rates, BFECC, vorticity, wall reflection.
- **Particle influence** — how the morphing particles read from the velocity field.
- **Particle physics** — spring/drag for the particle simulation.
- **Particle render** — point size, spin speed, scale.
- **Morph** — hold/duration of the morph cycle (sphere → tetra → trefoil → "TSL" → "GLSL").
- **Overlay** — style picker, intensity, opacity, cursor colour, etc.
- **Distortion** — style picker, intensity.

## Tuning the look (without Tweakpane)

The defaults are in `js/fluid.js` as `DEFAULT_FLUID_PARAMS`. Switching the **overlay style** is the biggest visual change — current options:

`default`, `volumeCursor`, `trail`, `oil`, `velocity`, `colorful`, `rainbowFish`, `glaze`, `burn`, `smoke`, `artInk`, `rainbowInk`, `colorWater`, `liquidLens`

Switching the **distortion style**:

`simple`, `rgbShift`, `chromatic`, `water`, `waterCaustics`

For the about-scene tunnel, see `js/particles.js`:

- `count` (default 9000) — number of tunnel particles.
- `TUNNEL_PALETTE` — colour stops; mix in any hex codes.
- `tunnelSpeed` (12) / `tunnelLength` (140) — forward velocity and depth of the tunnel.

## Performance profiles

The fluid sim picks an internal FBO resolution based on a `profile` setting. You can override it with a URL query string:

- `?profile=performance` — smallest FBOs, fastest
- `?profile=balanced` — default
- `?profile=quality` — biggest FBOs, prettiest

(The fluid sim recreates its buffers at the chosen size on page load — it can't be hot-swapped, so the URL param triggers a reload.)

## Adding more sections

1. Add `<section class="section" data-section="N">…</section>` to `index.html`.
2. Add a `<button class="nav-dot" data-section="N">` to the nav.
3. In `js/scroll.js`, extend `this.modeForSection` with the target `transitionT` for that section. `0` keeps the fluid (or vortex) hero; `1` is the tunnel; mid-values cross-fade.

## Credits

- Fluid simulation, post-processing overlays, morph particles, and demo composition: **[`three-fluid-fx`](https://github.com/artcodev/three-fluid-fx)** by Artem Korenevych — MIT.
- Three.js · MIT.
- GSAP · standard commercial / non-commercial license.
- Tweakpane · MIT.
>>>>>>> 0686656 (Initial portfolio site)
