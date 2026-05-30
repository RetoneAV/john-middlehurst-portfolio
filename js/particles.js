/* ============================================================
   Background orchestrator
   ------------------------------------------------------------
   Owns the WebGL renderer and two visual systems that share it:
     * VortexEffect    : a fluid/smoke vortex in orange-purple-blue
                         used for the hero scene (transitionT = 0).
     * Tunnel particles: a forward-moving circular tunnel of points,
                         used for the about scene (transitionT = 1).
   They cross-fade smoothly as `transitionT` is tweened externally.

   The class is exposed as `App.ParticleSystem` so the rest of the
   app (main.js, scroll.js) keeps the same call sites.
   ============================================================ */
import * as THREE from "three";
import { VortexEffect } from "./vortex.js";

const POINT_VERT = /* glsl */ `
    precision mediump float;
    attribute float aSize;
    attribute float aShade;
    attribute vec3 aColor;
    uniform mediump float uOpacity;
    uniform mediump float uResolutionScale; // scales point size with viewport
    uniform mediump float uSizeMul;
    varying vec3 vColor;
    varying float vDepth;
    varying float vShade;
    void main() {
      vColor = aColor;
      vShade = aShade;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mvPosition.z;
      // Point size scales with viewport so particles stay readable on any screen
      gl_PointSize = aSize * uSizeMul * uResolutionScale * (1.0 / max(vDepth, 0.001)) * (0.35 + uOpacity * 0.65);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const POINT_FRAG = /* glsl */ `
    precision mediump float;
    varying vec3 vColor;
    varying float vDepth;
    varying float vShade;
    uniform mediump float uOpacity;
    uniform mediump float uBrightness;
    uniform mediump float uColorMix;
    uniform mediump float uColorSaturation;
    uniform vec3 uColorPrimary;
    uniform vec3 uColorSecondary;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float r = length(c) * 2.0;
      if (r > 1.0) discard;
      float core = smoothstep(1.0, 0.0, r);
      float glow = smoothstep(1.0, 0.55, r) * 0.4;
      float a = core + glow;
      float depthFade = clamp(1.0 - (vDepth - 18.0) / 110.0, 0.0, 1.0);

      // Blend procedural per-particle color toward user-defined primary/secondary gradient
      vec3 userTint = mix(uColorSecondary, uColorPrimary, vShade);
      vec3 tinted = mix(vColor, userTint, uColorMix);

      // Saturation around per-pixel luminance
      float lum = dot(tinted, vec3(0.299, 0.587, 0.114));
      vec3 saturated = mix(vec3(lum), tinted, uColorSaturation);

      // Additive blending: premultiply by transition opacity + user brightness
      gl_FragColor = vec4(saturated * uOpacity * uBrightness, a * depthFade);
    }
  `;

  // Procedural tunnel palette (cool purples/greens). Used as the per-particle
  // base color; user overrides via primary/secondary + mix in params.
  const TUNNEL_PALETTE = [
    0x8b5cf6, 0xa855f7, 0x7c3aed, 0x6366f1,
    0x10b981, 0x22c55e, 0x14b8a6, 0x4ade80,
  ];

  // Tunable defaults for the user-facing tunnel knobs. Cloned into instance
  // params so callers can mutate freely.
  export const DEFAULT_TUNNEL_PARAMS = {
    particleSize: 1.0,         // multiplier on per-particle size
    brightness: 1.0,           // multiplier on output color (0..3)
    colorPrimary: "#a855f7",   // user gradient stop A (hex string for tweakpane)
    colorSecondary: "#10b981", // user gradient stop B
    colorMix: 0.0,             // 0 = procedural palette, 1 = pure user gradient
    colorSaturation: 1.0,      // 0 = grayscale, >1 = punchier
    cursorSteer: 1.0,          // multiplier on tunnel-end cursor offset
    cursorParallax: 1.0,       // multiplier on camera position parallax
    breath: 0.10,              // small per-particle organic motion (world units)
    rotationSpeed: 0.0,         // resting spin around z (rad/s, positive = CCW)
    transitionSpinTarget: 0.75, // peak spin during scene-transition envelope
  };

export class ParticleSystem {
    constructor(canvas, opts) {
      opts = opts || {};
      this.canvas = canvas;
      this.count = opts.count == null ? 9000 : opts.count;

      // Merge user params over defaults; expose as `.params` for tweakpane.
      this.params = { ...DEFAULT_TUNNEL_PARAMS, ...(opts.params || {}) };

      // --- Renderer (shared by vortex + tunnel) ---
      this.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: false,
        alpha: true,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
      });
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);

      // --- Vortex effect (hero scene) ---
      this.vortex = new VortexEffect(this.renderer);
      this.vortex.setSize(window.innerWidth, window.innerHeight);

      // --- Tunnel particle scene (about scene) ---
      this._buildTunnel();
      this._applyParamsToUniforms();

      // --- State ---
      this.transitionT = 0;             // 0 = vortex/hero, 1 = tunnel/about
      // 'vortex' renders the procedural vortex (fallback path).
      // 'fluid'  skips the vortex because a separate WebGPU canvas is showing the fluid scene on top.
      this.heroMode = "vortex";
      this.mouseTarget = new THREE.Vector2(0, 0);
      this.mouse = new THREE.Vector2(0, 0);
      this.tunnelOffset = new THREE.Vector2(0, 0);
      this.tunnelSpinAngle = 0;          // accumulated rotation of the ring (radians)
      this._transitionSpinT = 0;          // 0..1..0 envelope from SnapScroll
      this.time = 0;

      window.addEventListener("resize", () => this.resize());
    }

    // ---- Tunnel setup -------------------------------------------------

    _buildTunnel() {
      this.tunnelScene = new THREE.Scene();
      this.tunnelCamera = new THREE.PerspectiveCamera(
        68,
        window.innerWidth / Math.max(1, window.innerHeight),
        0.1,
        300
      );
      this.tunnelCamera.position.set(0, 0, 30);

      const n = this.count;
      this.positions   = new Float32Array(n * 3);
      this.tunnelBase  = new Float32Array(n * 3); // ring (x, y); z encoded via seed
      this.tunnelSeed  = new Float32Array(n);     // 0..1 phase along tunnel depth
      this.colors      = new Float32Array(n * 3);
      this.sizes       = new Float32Array(n);
      this.shades      = new Float32Array(n);     // 0..1 mix between primary/secondary

      const palette = TUNNEL_PALETTE.map((h) => new THREE.Color(h));

      for (let i = 0; i < n; i++) {
        const ix = i * 3;

        // Tunnel ring with slight thickness
        const tt = Math.random() * Math.PI * 2;
        const tr = 9 + Math.pow(Math.random(), 1.5) * 3.5;
        this.tunnelBase[ix + 0] = Math.cos(tt) * tr;
        this.tunnelBase[ix + 1] = Math.sin(tt) * tr;
        this.tunnelBase[ix + 2] = 0;
        this.tunnelSeed[i] = Math.random();
        this.shades[i] = Math.random();

        // Start positions = ring positions (so they're ready as soon as they appear)
        this.positions[ix + 0] = this.tunnelBase[ix + 0];
        this.positions[ix + 1] = this.tunnelBase[ix + 1];
        this.positions[ix + 2] = 14 - this.tunnelSeed[i] * 140;

        // Colour: blend of two palette stops
        const ca = palette[(Math.random() * palette.length) | 0];
        const cb = palette[(Math.random() * palette.length) | 0];
        const mix = Math.random();
        this.colors[ix + 0] = ca.r * (1 - mix) + cb.r * mix;
        this.colors[ix + 1] = ca.g * (1 - mix) + cb.g * mix;
        this.colors[ix + 2] = ca.b * (1 - mix) + cb.b * mix;

        // Size with a long tail of brighter sparks
        const sRoll = Math.random();
        this.sizes[i] = sRoll < 0.05 ? 0.16 + Math.random() * 0.10
                                     : 0.04 + Math.random() * 0.08;
      }

      this.geometry = new THREE.BufferGeometry();
      this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
      this.geometry.setAttribute("aColor",   new THREE.BufferAttribute(this.colors, 3));
      this.geometry.setAttribute("aSize",    new THREE.BufferAttribute(this.sizes, 1));
      this.geometry.setAttribute("aShade",   new THREE.BufferAttribute(this.shades, 1));

      this.material = new THREE.ShaderMaterial({
        uniforms: {
          uOpacity:         { value: 0 },
          uResolutionScale: { value: 520.0 },
          uSizeMul:         { value: 1.0 },
          uBrightness:      { value: 1.0 },
          uColorMix:        { value: 0.0 },
          uColorSaturation: { value: 1.0 },
          uColorPrimary:    { value: new THREE.Color(0xa855f7) },
          uColorSecondary:  { value: new THREE.Color(0x10b981) },
        },
        vertexShader: POINT_VERT,
        fragmentShader: POINT_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this._updateResolutionScale();

      this.points = new THREE.Points(this.geometry, this.material);
      this.points.frustumCulled = false;
      this.tunnelScene.add(this.points);

      this.tunnelLength = 140;
      this.tunnelSpeed  = 12;
      this.tunnelZPhase = 0;
    }

    // ---- Public API ---------------------------------------------------

    setTransition(t) {
      this.transitionT = Math.max(0, Math.min(1, t));
    }

    setMouse(x, y) {
      this.mouseTarget.set(x, y);
      this.vortex.setMouse(x, y);
    }

    setDpr(dpr) {
      const d = Math.min(dpr, 2);
      this.renderer.setPixelRatio(d);
      this.vortex.setSize(window.innerWidth, window.innerHeight);
    }

    /** Patch tunnel params and push them into uniforms. Tweakpane uses this. */
    setParams(partial) {
      if (!partial) return;
      Object.assign(this.params, partial);
      this._applyParamsToUniforms();
    }

    /** 0..1..0 envelope driven by SnapScroll's transition timeline. Drives a
     *  short spin boost on the tunnel ring, peaking at the transition mid-point
     *  (mirrors the fluid scene's transition spin behaviour). */
    setTransitionSpinProgress(t) {
      this._transitionSpinT = Math.max(0, Math.min(1, t));
    }

    _applyParamsToUniforms() {
      const u = this.material.uniforms;
      const p = this.params;
      u.uSizeMul.value         = p.particleSize;
      u.uBrightness.value      = p.brightness;
      u.uColorMix.value        = p.colorMix;
      u.uColorSaturation.value = p.colorSaturation;
      u.uColorPrimary.value.set(p.colorPrimary);
      u.uColorSecondary.value.set(p.colorSecondary);
    }

    resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.tunnelCamera.aspect = w / Math.max(1, h);
      this.tunnelCamera.updateProjectionMatrix();
      this.vortex.setSize(w, h);
      this._updateResolutionScale();
    }

    _updateResolutionScale() {
      // Tie point size to the rendered pixel height so particles read at the
      // same proportion of the viewport on any screen. Floor at 600 for very
      // small embed/test viewports.
      const h = Math.max(this.renderer.domElement.height, 600);
      this.material.uniforms.uResolutionScale.value = h;
    }

    // ---- Per-frame ----------------------------------------------------

    update(dt) {
      dt = Math.min(dt, 1 / 30);
      this.time += dt;

      const t = this.transitionT;
      // When the fluid scene is the hero (rendered on its own canvas above),
      // we still want this canvas to do the tunnel; the vortex is not drawn.
      const useVortex = this.heroMode === "vortex";
      const vortexAlpha = useVortex ? (1 - t) : 0;
      const tunnelAlpha = t;

      // Smooth mouse for the tunnel side
      this.mouse.lerp(this.mouseTarget, 0.10);

      // ---------------- VORTEX UPDATE ----------------
      this.vortex.setOpacity(vortexAlpha);
      this.vortex.update(dt);

      // ---------------- TUNNEL UPDATE ----------------
      if (tunnelAlpha > 0.005) {
        this._updateTunnel(dt, tunnelAlpha);
      }
      this.material.uniforms.uOpacity.value = tunnelAlpha;

      // ---------------- RENDER ----------------
      // Clear once, then layer
      this.renderer.autoClear = true;
      this.renderer.setClearColor(0x000000, useVortex ? 1 : 0);

      if (useVortex) {
        // Vortex: render as the base layer (covers screen).
        this.vortex.render();
      } else {
        // No vortex: just clear the canvas (alpha = 0) so the fluid canvas below shows through.
        this.renderer.clear();
      }

      // Tunnel particles: additively layered on top.
      if (tunnelAlpha > 0.005) {
        this.renderer.autoClear = false;
        this.renderer.render(this.tunnelScene, this.tunnelCamera);
      }
    }

    _updateTunnel(dt, alpha) {
      const params = this.params;

      // Tunnel-end offset (where the vanishing point is steered) — scales
      // up smoothly as we fade into the tunnel so the cursor doesn't jerk it
      // around during the transition.
      const steer = params.cursorSteer;
      const targetOffX = this.mouse.x * 9 * alpha * steer;
      const targetOffY = this.mouse.y * 6 * alpha * steer;
      this.tunnelOffset.x += (targetOffX - this.tunnelOffset.x) * 0.08;
      this.tunnelOffset.y += (targetOffY - this.tunnelOffset.y) * 0.08;

      const TUNNEL_LEN = this.tunnelLength;
      this.tunnelZPhase = (this.tunnelZPhase + dt * this.tunnelSpeed) % TUNNEL_LEN;

      // Spin: lerp between the resting rotation speed and the transition
      // peak based on the 0..1..0 envelope coming from SnapScroll. When the
      // envelope is at 0 we use the user's resting rotation speed only.
      const spinT = this._transitionSpinT;
      const effectiveSpin =
        params.rotationSpeed * (1 - spinT) + params.transitionSpinTarget * spinT;
      this.tunnelSpinAngle += effectiveSpin * dt;

      const cs = Math.cos(this.tunnelSpinAngle);
      const sn = Math.sin(this.tunnelSpinAngle);

      const positions = this.positions;
      const base = this.tunnelBase;
      const seed = this.tunnelSeed;
      const offX = this.tunnelOffset.x;
      const offY = this.tunnelOffset.y;
      const time = this.time;
      const breathAmp = params.breath;

      // Deterministic XY: target = R(spin) * base + offset * depthFactor + breath.
      // No spring → no overshoot/wobble at screen edges, no jolt at z-wrap.
      // The breath is a slow per-particle sinusoid keyed off the seed so each
      // point oscillates at its own phase, giving organic life without ringing.
      for (let i = 0; i < this.count; i++) {
        const ix = i * 3;
        const iy = ix + 1;
        const iz = ix + 2;

        // --- Z (forward motion): deterministic, no spring ---
        const phase = (seed[i] * TUNNEL_LEN + this.tunnelZPhase) % TUNNEL_LEN;
        const zWorld = 14 - phase; // 14 (near camera) down to -126 (far)
        positions[iz] = zWorld;

        // --- XY (rotated ring + steering + organic breath) ---
        const depthFactor = Math.max(0, (14 - zWorld) / TUNNEL_LEN);
        const phaseOffset = seed[i] * 6.2831853;
        const breathX = Math.sin(time * 0.7 + phaseOffset) * breathAmp;
        const breathY = Math.cos(time * 0.5 + phaseOffset * 1.3) * breathAmp;

        const bx = base[ix];
        const by = base[iy];
        const rotBx = cs * bx - sn * by;
        const rotBy = sn * bx + cs * by;

        positions[ix] = rotBx + offX * depthFactor + breathX;
        positions[iy] = rotBy + offY * depthFactor + breathY;
      }

      this.geometry.attributes.position.needsUpdate = true;

      // Subtle camera sway in tunnel mode (mouse adds a small parallax).
      // The lookAt target is anchored at z=-10 to soften rotation.
      const para = params.cursorParallax;
      this.tunnelCamera.position.x = this.mouse.x * 0.25 * para;
      this.tunnelCamera.position.y = this.mouse.y * 0.20 * para;
      this.tunnelCamera.position.z = 30 - alpha * 4;
      this.tunnelCamera.lookAt(
        this.tunnelOffset.x * 0.3,
        this.tunnelOffset.y * 0.3,
        -10
      );
    }
  }

