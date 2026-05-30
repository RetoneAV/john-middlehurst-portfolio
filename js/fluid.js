/* ============================================================
   FluidScene — WebGPU/TSL hero background
   ------------------------------------------------------------
   Adapted from the three-fluid-fx "Mega Demo":
     https://three-fluid-fx.artcreativecode.com/examples/tsl/full/mega/

   Stripped down for production use: no demo auto-reel, no
   slideshow / background switcher, no on-screen Tweakpane
   (that lives in `tweakpane-controls.js` and is mounted by
   the bootstrap when this scene initialises).

   The scene contains:
     * a soft "Backdrop" plane behind everything
     * GPGPU MorphFlowParticles in the centre (morph between
       sphere -> tetra -> trefoil -> "TSL" -> "GLSL")
     * a cursor-driven fluid simulation (Navier-Stokes splats)
     * an Art Ink overlay + simple screen distortion applied
       to the final image as post-processing
   ============================================================ */
import {
  ACESFilmicToneMapping,
  Color,
  Matrix3,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector2,
  Vector3,
} from "three";
import { RenderPipeline, WebGPURenderer } from "three/webgpu";
import { pass, uniform } from "three/tsl";
import {
  attachPointerSplats,
  chromaticDistortion,
  FluidSimulation,
  fluidOverlay,
  rgbShiftDistortion,
  simpleDistortion,
  waterCausticsDistortion,
  waterDistortion,
} from "three-fluid-fx/tsl";

import { Backdrop } from "./vendor/three-fluid-fx-extras/extras/backgrounds/tsl/Backdrop.js";
import {
  MorphFlowParticles,
  DEFAULT_TARGET_CONFIGS,
} from "./vendor/three-fluid-fx-extras/extras/particles/tsl/MorphFlowParticles.js";
import { resolveProfile } from "./vendor/three-fluid-fx-extras/extras/resolveProfile.js";
import {
  asNode,
  asTsl,
  setPipelineOutput,
} from "./vendor/three-fluid-fx-extras/tsl/shared/nodeInterop.js";
import { SCALE } from "./vendor/three-fluid-fx-extras/extras/controls/paramRanges.js";

const CAMERA_FOV = 45;
const CAMERA_Z = 6.4;
const FIXED_FLUID_DT = 1 / 60;
const MAX_FLUID_SUBSTEPS = 4;

const OVERLAY_STYLE_DEFAULTS = {
  default:      { intensity: 0.85, velocityScale: 1 },
  volumeCursor: { intensity: 0.85, velocityScale: 1 },
  trail:        { intensity: 1.2,  velocityScale: 1 },
  oil:          { intensity: 1.15, velocityScale: 1 },
  velocity:     { intensity: 0.25, velocityScale: 0.55 },
  colorful:     { intensity: 1.0,  velocityScale: 1 },
  rainbowFish:  { intensity: 0.6,  velocityScale: 0.3 },
  glaze:        { intensity: 0.9,  velocityScale: 1 },
  burn:         { intensity: 1.15, velocityScale: 1 },
  smoke:        { intensity: 0.85, velocityScale: 1 },
  artInk:       { intensity: 0.85, velocityScale: 1 },
  rainbowInk:   { intensity: 0.85, velocityScale: 1 },
  colorWater:   { intensity: 1.05, velocityScale: 1 },
  liquidLens:   { intensity: 0.9,  velocityScale: 1 },
};

export const DEFAULT_FLUID_PARAMS = {
  particlesEnabled: true,
  morphEnabled: true,
  overlayEnabled: true,
  distortionEnabled: true,
  // Fluid sim
  splatRadius: 14,
  splatForce: 7,
  pressureIterations: 10,
  curlStrength: 0.18,
  velocityDissipation: 0.99,
  densityDissipation: 0.94,
  dyeDissipation: 0.965,
  pressureDissipation: 0.8,
  enableVorticity: false,
  bfecc: true,
  reflectWalls: false,
  // Particle influence
  flowStrength: 1.05,
  depthLift: 0.95,
  flowThreshold: 50,
  maxFlowSpeed: 12,
  responseGamma: 4,
  perpendicularAngle: 1.25,
  sideVariation: 1,
  depthAttenuationScale: 2,
  // Physics
  spring: 4,
  zeta: 1.15,
  dragLin: 0.28,
  dragQuad: 0.05,
  aMax: 24,
  vMaxScale: 1,
  // Particle render
  pointSize: 10,
  rotationSpeed: 0.08,
  transitionSpinTarget: 2,
  particleScale: 1,
  particlePrimary: { r: 0.95, g: 0.5, b: 0.2 },
  particleSecondary: { r: 0.4, g: 0.3, b: 0.95 },
  particleColorMix: 0,
  particleSaturation: 1,
  // Saturation oscillator: when enabled, the saturation pushed to the
  // particle uniforms cycles smoothly between min and max with a sine
  // envelope. Independent of the static `particleSaturation` slider above
  // (which is used when the oscillator is disabled).
  saturationOscEnabled: true,
  saturationOscMin: 1.15,
  saturationOscMax: 2.0,
  saturationOscPeriod: 6.0,
  holdSeconds: 6.5,
  morphSeconds: 4.8,
  // Shape cycle (clone the defaults so live edits don't mutate the shared array)
  targets: DEFAULT_TARGET_CONFIGS.map((c) => ({ ...c })),
  // Overlay
  overlayStyle: "artInk",
  overlayIntensity: OVERLAY_STYLE_DEFAULTS.artInk.intensity,
  overlayOpacity: 0.5,
  overlayVelocityScale: OVERLAY_STYLE_DEFAULTS.artInk.velocityScale,
  cursorColor: { r: 0.85, g: 0.95, b: 1 },
  vibrance: 0.5,
  liquidColor: { r: 0.85, g: 0.25, b: 1 },
  // Distortion
  distortionStyle: "simple",
  distortionIntensity: 0.45,
};

export class FluidScene {
  static isSupported() {
    return typeof navigator !== "undefined" && "gpu" in navigator;
  }

  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ready = false;
    this.opacity = 1;
    this.opacityTarget = 1;

    this.params = {
      ...DEFAULT_FLUID_PARAMS,
      ...opts.params,
      cursorColor: {
        ...DEFAULT_FLUID_PARAMS.cursorColor,
        ...(opts.params && opts.params.cursorColor),
      },
      liquidColor: {
        ...DEFAULT_FLUID_PARAMS.liquidColor,
        ...(opts.params && opts.params.liquidColor),
      },
      particlePrimary: {
        ...DEFAULT_FLUID_PARAMS.particlePrimary,
        ...(opts.params && opts.params.particlePrimary),
      },
      particleSecondary: {
        ...DEFAULT_FLUID_PARAMS.particleSecondary,
        ...(opts.params && opts.params.particleSecondary),
      },
      targets: (opts.params && Array.isArray(opts.params.targets)
        ? opts.params.targets
        : DEFAULT_FLUID_PARAMS.targets
      ).map((c) => ({ ...c })),
    };

    // Listeners for tweakpane to know when to rebuild the post-process pipeline
    this._postRebuildSubscribers = new Set();
  }

  async init() {
    const canvas = this.canvas;

    // --- Renderer ---
    this.renderer = new WebGPURenderer({
      canvas,
      antialias: true,
      forceWebGL: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setClearColor(new Color("#07080b"), 1);
    await this.renderer.init();

    // --- Scene & camera ---
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
    this.camera.position.set(0, 0, CAMERA_Z);
    this.camera.updateMatrixWorld(true);

    // --- Fluid sim ---
    const profile = resolveProfile("balanced");
    this.fluid = new FluidSimulation(this.renderer, {
      profile,
      splatRadius: this.params.splatRadius * SCALE.splatRadius,
      splatForce: this.params.splatForce,
      pressureIterations: this.params.pressureIterations,
      curlStrength: this.params.curlStrength,
      velocityDissipation: this.params.velocityDissipation,
      densityDissipation: this.params.densityDissipation,
      pressureDissipation: this.params.pressureDissipation,
      enableVorticity: this.params.enableVorticity,
      bfecc: this.params.bfecc,
      reflectWalls: this.params.reflectWalls,
    });
    this.fluid.enableDye = true;

    // --- Morph particles ---
    this.particles = new MorphFlowParticles(this.renderer, {
      size: 64,
      holdSeconds: this.params.holdSeconds,
      morphSeconds: this.params.morphSeconds,
      targets: this.params.targets,
    });
    this.scene.add(this.particles.mesh);

    // Initial color params push (subsequent updates happen each frame)
    this.particles.setColorParams({
      primary: this.params.particlePrimary,
      secondary: this.params.particleSecondary,
      mix: this.params.particleColorMix,
      saturation: this.params.particleSaturation,
    });

    // --- Backdrop (dark) ---
    this.backdrop = new Backdrop(this.camera, "dark");
    this.scene.add(this.backdrop.mesh);

    // --- Post-process uniforms ---
    this.overlayIntensity = uniform(this.params.overlayIntensity);
    this.overlayOpacity = uniform(this.params.overlayOpacity);
    this.overlayVelocityScale = uniform(this.params.overlayVelocityScale);
    this.distortionIntensity = uniform(this.params.distortionIntensity);
    this.elapsedTime = uniform(0);
    this.dyeTexel = uniform(new Vector2(1 / 512, 1 / 512));
    this.cursorColor = uniform(
      new Color(
        this.params.cursorColor.r,
        this.params.cursorColor.g,
        this.params.cursorColor.b
      )
    );
    this.vibrance = uniform(this.params.vibrance);

    // --- Pipeline ---
    this.scenePass = pass(this.scene, this.camera);
    this.pipeline = new RenderPipeline(this.renderer);
    this._rebuildPipeline();

    // --- Pointer splats: attach to canvas. Sections must let pointermove through. ---
    this._detachPointerSplats = attachPointerSplats(canvas, this.fluid, {
      coloredStrokes: true,
      colorize: (dx, dy) => this._liquidLensColorize(dx, dy),
    });

    // --- Sizing / animation state ---
    this._clock = new Timer();
    this._cameraRight = new Vector3();
    this._cameraUp = new Vector3();
    this._modelRotation = new Matrix3();
    this._spinAngle = 0;
    this._fluidAccumulator = 0;
    this._morphTime = 0;
    this._transitionSpinT = 0;

    this._resize();
    window.addEventListener("resize", this._onResize);

    this.ready = true;
  }

  _onResize = () => this._resize();

  _resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = CAMERA_FOV;
    this.camera.position.set(0, 0, CAMERA_Z);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.fluid.resize(w, h);
    this._syncDyeTexel();
    this._layoutParticles();
  }

  _syncDyeTexel() {
    const img = this.fluid.dyeTexture.image;
    const w = img.width ?? 512;
    const h = img.height ?? 512;
    asTsl(this.dyeTexel).value.set(1 / w, 1 / h);
  }

  _layoutParticles() {
    const height = 2 * CAMERA_Z * Math.tan((CAMERA_FOV * Math.PI) / 360);
    const width = height * this.camera.aspect;
    const viewport = { height, width };
    const baseScale = Math.min(1.35, Math.max(0.58, (viewport.height * 0.82) / 4));
    this.particles.mesh.position.set(0, 0, 0);
    this.particles.mesh.scale.setScalar(baseScale * this.params.particleScale);
  }

  // ---- Pipeline construction --------------------------------------------

  _buildDistortion(style, sceneNode) {
    const fluidNode = asNode(this.fluid.densityNode);
    const i = asNode(this.distortionIntensity);
    const t = asNode(this.elapsedTime);
    switch (style) {
      case "simple":         return simpleDistortion(sceneNode, fluidNode, i);
      case "rgbShift":       return rgbShiftDistortion(sceneNode, fluidNode, i);
      case "chromatic":      return chromaticDistortion(sceneNode, fluidNode, i);
      case "water":          return waterDistortion(sceneNode, fluidNode, i);
      case "waterCaustics":  return waterCausticsDistortion(sceneNode, fluidNode, i, t);
      default:               return simpleDistortion(sceneNode, fluidNode, i);
    }
  }

  _buildOverlay(style, sceneNode) {
    return fluidOverlay(
      style,
      sceneNode,
      asNode(this.fluid.densityNode),
      asNode(this.fluid.dyeNode),
      asNode(this.fluid.velocityNode),
      {
        intensity: asNode(this.overlayIntensity),
        opacity: asNode(this.overlayOpacity),
        time: asNode(this.elapsedTime),
        texel: asNode(this.dyeTexel),
        cursorColor: asNode(this.cursorColor),
        vibrance: asNode(this.vibrance),
        velocityScale: asNode(this.overlayVelocityScale),
      }
    );
  }

  _rebuildPipeline() {
    let output = asNode(this.scenePass);
    if (this.params.distortionEnabled) {
      output = this._buildDistortion(this.params.distortionStyle, output);
    }
    if (this.params.overlayEnabled) {
      output = this._buildOverlay(this.params.overlayStyle, output);
    }
    setPipelineOutput(this.pipeline, output);
  }

  /** Pipeline-changing params (overlay/distortion enable, style) must call this. */
  rebuildPipeline() {
    if (!this.ready) return;
    this._rebuildPipeline();
    for (const cb of this._postRebuildSubscribers) cb();
  }

  /**
   * Apply the current `params.targets[index]` config to the morph particles.
   * Tweakpane bindings on individual target fields call this on change so the
   * cycle reflects edits without rebuilding everything.
   */
  refreshTarget(index) {
    if (!this.ready || !this.particles) return;
    const cfg = this.params.targets[index];
    if (!cfg) return;
    this.particles.setTargetConfig(index, cfg);
  }

  // ---- Per-frame --------------------------------------------------------

  /** Synchronise uniform values from this.params (called every frame). */
  _syncParamUniforms() {
    const p = this.params;
    this.particles.mesh.visible = p.particlesEnabled;
    this.particles.holdSeconds = p.holdSeconds;
    this.particles.morphSeconds = p.morphSeconds;

    // Optional smooth oscillation between min/max — keeps the manual
    // saturation slider as the resting value when disabled.
    let satValue = p.particleSaturation;
    if (p.saturationOscEnabled) {
      const period = Math.max(0.1, p.saturationOscPeriod);
      const phase01 = (Math.sin(((this._elapsedSec || 0) / period) * Math.PI * 2) + 1) * 0.5;
      satValue = p.saturationOscMin + (p.saturationOscMax - p.saturationOscMin) * phase01;
    }

    this.particles.setColorParams({
      primary: p.particlePrimary,
      secondary: p.particleSecondary,
      mix: p.particleColorMix,
      saturation: satValue,
    });
    this.fluid.splatRadius = p.splatRadius * SCALE.splatRadius;
    this.fluid.splatForce = p.splatForce;
    this.fluid.pressureIterations = p.pressureIterations;
    this.fluid.curlStrength = p.curlStrength;
    this.fluid.velocityDissipation = p.velocityDissipation;
    this.fluid.densityDissipation = p.densityDissipation;
    this.fluid.dyeDissipation = p.dyeDissipation;
    this.fluid.pressureDissipation = p.pressureDissipation;
    this.fluid.enableVorticity = p.enableVorticity;
    this.fluid.bfecc = p.bfecc;
    this.fluid.reflectWalls = p.reflectWalls;
    asTsl(this.overlayIntensity).value = p.overlayIntensity;
    asTsl(this.overlayOpacity).value = p.overlayOpacity;
    asTsl(this.overlayVelocityScale).value = p.overlayVelocityScale;
    asTsl(this.distortionIntensity).value = p.distortionIntensity;
    asTsl(this.vibrance).value = p.vibrance;
    asTsl(this.cursorColor).value.setRGB(
      p.cursorColor.r,
      p.cursorColor.g,
      p.cursorColor.b
    );
  }

  _liquidLensColorize(dx, dy) {
    if (!this.params.overlayEnabled || this.params.overlayStyle !== "liquidLens") {
      return undefined;
    }
    const lc = this.params.liquidColor;
    const sx = Math.min(Math.abs(dx) / 25, 1);
    const sy = Math.min(Math.abs(dy) / 25, 1);
    const speed = Math.hypot(sx, sy);
    const base = 0.4 + speed * 0.6;
    return [
      (lc.r * base + sx * 0.5) * 0.3,
      lc.g * base * 0.3,
      (lc.b * base + sy * 0.5) * 0.3,
    ];
  }

  update(_dt) {
    if (!this.ready) return;

    this._clock.update();
    const frameDt = Math.min(
      Math.max(this._clock.getDelta(), 1e-6),
      FIXED_FLUID_DT * MAX_FLUID_SUBSTEPS
    );
    const elapsed = this._clock.getElapsed();
    const p = this.params;
    this._elapsedSec = elapsed;
    asTsl(this.elapsedTime).value = elapsed;

    this._syncParamUniforms();
    this._layoutParticles();

    if (p.morphEnabled) this._morphTime += frameDt;
    // Spin: lerps from base (rotationSpeed) toward transitionSpinTarget while
    // a scene transition is in flight. SnapScroll drives `_transitionSpinT`
    // from 0 → 1 (during slide-out) → 0 (during slide-in).
    const t = this._transitionSpinT;
    const effectiveSpin =
      p.rotationSpeed + (p.transitionSpinTarget - p.rotationSpeed) * t;
    this._spinAngle += effectiveSpin * frameDt;
    this.particles.mesh.rotation.y = this._spinAngle;
    this.particles.mesh.updateMatrixWorld(true);
    this._modelRotation.setFromMatrix4(this.particles.mesh.matrixWorld);

    // Fluid substeps
    this._fluidAccumulator += frameDt;
    let substeps = 0;
    while (this._fluidAccumulator >= FIXED_FLUID_DT && substeps < MAX_FLUID_SUBSTEPS) {
      this.fluid.step(FIXED_FLUID_DT);
      this._fluidAccumulator -= FIXED_FLUID_DT;
      substeps += 1;
    }
    if (substeps === MAX_FLUID_SUBSTEPS) this._fluidAccumulator = 0;

    // Particle step
    if (p.particlesEnabled) {
      this.camera.updateMatrixWorld();
      this._cameraRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
      this._cameraUp.setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.particles.step(
        {
          dt: frameDt,
          velocityField: this.fluid.velocityTexture,
          viewMatrix: this.camera.matrixWorldInverse,
          projectionMatrix: this.camera.projectionMatrix,
          modelMatrix: this.particles.mesh.matrixWorld,
          cameraRight: this._cameraRight,
          cameraUp: this._cameraUp,
          modelRotation: this._modelRotation,
          pointSize: p.pointSize,
          spring: p.spring,
          zeta: p.zeta,
          dragLin: p.dragLin,
          dragQuad: p.dragQuad,
          aMax: p.aMax,
          vMaxScale: p.vMaxScale,
          flowStrength: p.flowStrength,
          depthLift: p.depthLift,
          flowThreshold: p.flowThreshold * SCALE.flowThreshold,
          maxFlowSpeed: p.maxFlowSpeed,
          responseGamma: p.responseGamma,
          perpendicularAngle: p.perpendicularAngle,
          sideVariation: p.sideVariation,
          depthAttenuationScale: p.depthAttenuationScale,
        },
        this._morphTime
      );
    }

    // Backdrop
    this.backdrop.update(frameDt, elapsed);

    // Render
    this.pipeline.render();
  }

  setOpacity(o) {
    const v = Math.max(0, Math.min(1, o));
    this.opacity = v;
    if (this.canvas) this.canvas.style.opacity = String(v);
  }

  /**
   * SnapScroll drives this 0 → 1 (during text slide-out) → 0 (during slide-in)
   * while a scene transition is in flight. The spin lerps from the user's
   * base `rotationSpeed` toward `transitionSpinTarget` in proportion to it.
   */
  setTransitionSpinProgress(t) {
    this._transitionSpinT = Math.max(0, Math.min(1, t));
  }

  /** For overlay style changes from Tweakpane: also apply that style's defaults. */
  applyOverlayStyleDefaults(style) {
    const d = OVERLAY_STYLE_DEFAULTS[style];
    if (!d) return;
    this.params.overlayIntensity = d.intensity;
    this.params.overlayVelocityScale = d.velocityScale;
  }

  dispose() {
    if (!this.ready) return;
    window.removeEventListener("resize", this._onResize);
    this._detachPointerSplats?.();
    this.scene.remove(this.particles.mesh);
    this.particles.dispose();
    this.pipeline.dispose();
    this.fluid.dispose();
    this.backdrop.dispose?.();
    this.renderer.dispose();
    this.ready = false;
  }
}

// Re-export overlay style defaults so the Tweakpane controller can use them
export { OVERLAY_STYLE_DEFAULTS };
