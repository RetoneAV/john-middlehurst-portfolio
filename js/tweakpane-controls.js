/* ============================================================
   Tweakpane GUI for the fluid scene.
   Hidden by default. Toggle with the ] key. All bindings persist to
   localStorage on change (debounced) and are restored on load.
   ============================================================ */
import { Pane } from "tweakpane";
import { OVERLAY_STYLE_DEFAULTS } from "./fluid.js";
import { RANGES } from "./vendor/three-fluid-fx-extras/extras/controls/paramRanges.js";
import {
  savePreferences,
  applyLayoutParams,
  applyTextContent,
  clearPreferences,
} from "./preferences.js";

const OVERLAY_OPTIONS = {
  Default: "default",
  "Volume Cursor": "volumeCursor",
  Trail: "trail",
  Oil: "oil",
  Velocity: "velocity",
  Colorful: "colorful",
  "Rainbow Fish": "rainbowFish",
  Glaze: "glaze",
  Burn: "burn",
  Smoke: "smoke",
  "Art Ink": "artInk",
  "Rainbow Ink": "rainbowInk",
  "Color Water": "colorWater",
  "Liquid Lens": "liquidLens",
};

const DISTORTION_OPTIONS = {
  Simple: "simple",
  "RGB Shift": "rgbShift",
  Chromatic: "chromatic",
  Water: "water",
  "Water + Caustics": "waterCaustics",
};

const usesCursorColor = (s) =>
  s === "trail" || s === "default" || s === "volumeCursor" || s === "artInk";
const usesVibrance = (s) => s !== "smoke" && s !== "velocity";
const usesVelocityScale = (s) => s === "velocity" || s === "rainbowFish";

export function mountTweakpane(
  fluid,
  snap,
  layoutParams,
  textContent,
  particles,
  portfolio,
  portfolioItems,
  clients,
  clientItems
) {
  if (!fluid) return null;

  const container = document.createElement("div");
  container.className = "tp-container";
  container.setAttribute("data-tweakpane-host", "");
  document.body.appendChild(container);

  const pane = new Pane({ title: "Fluid · Mega", container });
  const p = fluid.params;

  // Layers
  const layers = pane.addFolder({ title: "Layers" });
  layers.addBinding(p, "particlesEnabled", { label: "particles" });
  layers.addBinding(p, "morphEnabled", { label: "morph" });
  layers.addBinding(p, "overlayEnabled", { label: "overlay" })
    .on("change", () => fluid.rebuildPipeline());
  layers.addBinding(p, "distortionEnabled", { label: "distortion" })
    .on("change", () => fluid.rebuildPipeline());

  // Splat
  const splat = pane.addFolder({ title: "Splat", expanded: false });
  splat.addBinding(p, "splatRadius", { ...RANGES.splatRadius, label: "radius" });
  splat.addBinding(p, "splatForce",  { ...RANGES.splatForce,  label: "force"  });

  // Fluid sim
  const sim = pane.addFolder({ title: "Fluid sim", expanded: false });
  sim.addBinding(p, "pressureIterations",  { ...RANGES.pressureIterations,  label: "pressure" });
  sim.addBinding(p, "curlStrength",        { ...RANGES.curlStrength,        label: "curl" });
  sim.addBinding(p, "velocityDissipation", { ...RANGES.velocityDissipation, label: "vel diss" });
  sim.addBinding(p, "densityDissipation",  { ...RANGES.densityDissipation,  label: "dens diss" });
  sim.addBinding(p, "dyeDissipation",      { ...RANGES.densityDissipation,  label: "dye diss" });
  sim.addBinding(p, "pressureDissipation", { ...RANGES.pressureDissipation, label: "pres diss" });
  sim.addBinding(p, "enableVorticity", { label: "vorticity" });
  sim.addBinding(p, "bfecc",           { label: "BFECC" });
  sim.addBinding(p, "reflectWalls",    { label: "reflect walls" });

  // Particle influence
  const influence = pane.addFolder({ title: "Particle influence", expanded: false });
  influence.addBinding(p, "flowStrength",           { ...RANGES.flowStrength,           label: "flow" });
  influence.addBinding(p, "depthLift",              { ...RANGES.depthLift,              label: "3D lift" });
  influence.addBinding(p, "flowThreshold",          { ...RANGES.flowThreshold,          label: "thresh" });
  influence.addBinding(p, "maxFlowSpeed",           { ...RANGES.maxFlowSpeed,           label: "max speed" });
  influence.addBinding(p, "responseGamma",          { ...RANGES.responseGamma,          label: "response" });
  influence.addBinding(p, "depthAttenuationScale",  { ...RANGES.depthAttenuationScale,  label: "depth scale" });
  influence.addBinding(p, "perpendicularAngle",     { ...RANGES.perpendicularAngle,     label: "perp angle" });
  influence.addBinding(p, "sideVariation",          { ...RANGES.sideVariation,          label: "side var" });

  // Particle physics
  const physics = pane.addFolder({ title: "Particle physics", expanded: false });
  physics.addBinding(p, "spring",   { ...RANGES.spring,   label: "spring" });
  physics.addBinding(p, "zeta",     { ...RANGES.zeta,     label: "damping" });
  physics.addBinding(p, "dragLin",  { ...RANGES.dragLin,  label: "drag lin" });
  physics.addBinding(p, "dragQuad", { ...RANGES.dragQuad, label: "drag quad" });
  physics.addBinding(p, "aMax",     { ...RANGES.aMax,     label: "a max" });
  physics.addBinding(p, "vMaxScale",{ ...RANGES.vMaxScale,label: "v max" });

  // Particle render
  const render = pane.addFolder({ title: "Particle render", expanded: false });
  render.addBinding(p, "pointSize",     { ...RANGES.pointSize,    label: "point size" });
  render.addBinding(p, "rotationSpeed", { min: -5, max: 5, step: 0.01, label: "spin" });
  render.addBinding(p, "transitionSpinTarget", {
    label: "transition spin",
    min: -5, max: 5, step: 0.01,
  });
  render.addBinding(p, "particleScale", { label: "scale", min: 0.4, max: 1.8, step: 0.01 });
  render.addBinding(p, "particlePrimary", {
    label: "primary",
    color: { type: "float" },
  });
  render.addBinding(p, "particleSecondary", {
    label: "secondary",
    color: { type: "float" },
  });
  render.addBinding(p, "particleColorMix", {
    label: "color mix",
    min: 0, max: 1, step: 0.01,
  });
  render.addBinding(p, "particleSaturation", {
    label: "saturation",
    min: 0, max: 2, step: 0.01,
  });
  // Saturation oscillator — alternates the live saturation between min and max
  // with a sine envelope. Set 'osc' off to use the static slider value.
  const satOsc = render.addFolder({ title: "Saturation osc", expanded: false });
  satOsc.addBinding(p, "saturationOscEnabled", { label: "enabled" });
  satOsc.addBinding(p, "saturationOscMin",     { label: "min",        min: 0, max: 2, step: 0.01 });
  satOsc.addBinding(p, "saturationOscMax",     { label: "max",        min: 0, max: 2, step: 0.01 });
  satOsc.addBinding(p, "saturationOscPeriod",  { label: "period (s)", min: 0.5, max: 30, step: 0.1 });

  // Morph
  const morph = pane.addFolder({ title: "Morph", expanded: false });
  morph.addBinding(p, "holdSeconds",  { label: "hold",     min: 0.5, max: 16, step: 0.1 });
  morph.addBinding(p, "morphSeconds", { label: "duration", min: 0.5, max: 12, step: 0.1 });

  // Shape cycle: enable/disable each target, edit text + fontSize for text targets
  const shapes = pane.addFolder({ title: "Shape cycle", expanded: false });
  for (let i = 0; i < p.targets.length; i += 1) {
    const cfg = p.targets[i];
    const sub = shapes.addFolder({ title: cfg.label, expanded: false });
    sub.addBinding(cfg, "enabled", { label: "enabled" })
      .on("change", () => fluid.refreshTarget(i));
    const textBinding = sub.addBinding(cfg, "text", {
      label: "text",
    });
    textBinding.on("change", () => fluid.refreshTarget(i));
    const fontSizeBinding = sub.addBinding(cfg, "fontSize", {
      label: "font size",
      min: 40, max: 320, step: 1,
    });
    fontSizeBinding.on("change", () => fluid.refreshTarget(i));
    if (cfg.kind !== "text") {
      textBinding.hidden = true;
      fontSizeBinding.hidden = true;
    }
  }

  // Overlay
  const overlay = pane.addFolder({ title: "Overlay", expanded: false });
  overlay.addBinding(p, "overlayStyle", { label: "style", options: OVERLAY_OPTIONS })
    .on("change", () => {
      fluid.applyOverlayStyleDefaults(p.overlayStyle);
      syncVisibility();
      pane.refresh();
      fluid.rebuildPipeline();
    });
  overlay.addBinding(p, "overlayIntensity", { ...RANGES.intensity, max: 3, label: "intensity" });
  overlay.addBinding(p, "overlayOpacity",   { ...RANGES.opacity,           label: "opacity" });
  const velScaleBinding = overlay.addBinding(p, "overlayVelocityScale", {
    label: "velocity scale", min: 0.05, max: 2, step: 0.01,
  });
  const cursorColorBinding = overlay.addBinding(p, "cursorColor", {
    label: "cursor color", color: { type: "float" },
  });
  const vibranceBinding = overlay.addBinding(p, "vibrance", {
    label: "vibrance", min: 0, max: 1, step: 0.01,
  });
  const liquidColorBinding = overlay.addBinding(p, "liquidColor", {
    label: "liquid color", color: { type: "float" },
  });

  // Distortion
  const dist = pane.addFolder({ title: "Distortion", expanded: false });
  dist.addBinding(p, "distortionStyle", { label: "style", options: DISTORTION_OPTIONS })
    .on("change", () => fluid.rebuildPipeline());
  dist.addBinding(p, "distortionIntensity", { ...RANGES.intensity, max: 3, label: "intensity" });

  // Tunnel particles (scene 2). Only the WebGL `particles` system uses these;
  // every change is pushed into the live shader via setParams().
  if (particles && particles.params) {
    const tp = particles.params;
    const tunnel = pane.addFolder({ title: "Tunnel particles", expanded: false });
    tunnel.addBinding(tp, "particleSize", {
      label: "size", min: 0.2, max: 4, step: 0.01,
    });
    tunnel.addBinding(tp, "brightness", {
      label: "brightness", min: 0, max: 3, step: 0.01,
    });
    tunnel.addBinding(tp, "colorPrimary",   { label: "primary" });
    tunnel.addBinding(tp, "colorSecondary", { label: "secondary" });
    tunnel.addBinding(tp, "colorMix", {
      label: "color mix", min: 0, max: 1, step: 0.01,
    });
    tunnel.addBinding(tp, "colorSaturation", {
      label: "saturation", min: 0, max: 2, step: 0.01,
    });
    tunnel.addBinding(tp, "cursorSteer", {
      label: "cursor steer", min: 0, max: 3, step: 0.01,
    });
    tunnel.addBinding(tp, "cursorParallax", {
      label: "camera parallax", min: 0, max: 2, step: 0.01,
    });
    tunnel.addBinding(tp, "breath", {
      label: "breath", min: 0, max: 0.5, step: 0.005,
    });
    tunnel.addBinding(tp, "rotationSpeed", {
      label: "spin", min: -5, max: 5, step: 0.01,
    });
    tunnel.addBinding(tp, "tunnelSpeed", {
      label: "forward speed", min: 0, max: 40, step: 0.1,
    });
    tunnel.addBinding(tp, "transitionSpinTarget", {
      label: "transition spin", min: -5, max: 5, step: 0.01,
    });
    // tweakpane uses int hex for color bindings — keep params in sync and
    // push every change down to the GPU uniforms.
    tunnel.on("change", () => particles.setParams(tp));
  }

  // Scrolling — only present if a SnapScroll instance was passed in
  if (snap && snap.params) {
    const scroll = pane.addFolder({ title: "Scrolling", expanded: false });
    scroll.addBinding(snap.params, "wheelThreshold", {
      label: "wheel threshold",
      min: 10, max: 600, step: 5,
    });
  }

  // Layout — controls vertical positioning of the top/bottom text groups,
  // text-reveal stagger timing, and a global background dim for legibility.
  if (layoutParams) {
    const layout = pane.addFolder({ title: "Layout", expanded: false });
    layout.addBinding(layoutParams, "textPadTopVh", {
      label: "top inset (vh)",
      min: 0, max: 40, step: 0.5,
    });
    layout.addBinding(layoutParams, "textPadBottomVh", {
      label: "bottom inset (vh)",
      min: 0, max: 40, step: 0.5,
    });
    layout.addBinding(layoutParams, "textMaxRem", {
      label: "text width (rem)",
      min: 24, max: 120, step: 1,
    });
    layout.addBinding(layoutParams, "portfolioTextMaxRem", {
      label: "portfolio text width",
      min: 24, max: 120, step: 1,
    });
    layout.addBinding(layoutParams, "titleFontScale", {
      label: "title scale",
      min: 0.3, max: 2, step: 0.01,
    });
    layout.addBinding(layoutParams, "textStaggerScale", {
      label: "text stagger",
      min: 0, max: 3, step: 0.05,
    });
    layout.addBinding(layoutParams, "lineStagger", {
      label: "line stagger (s)",
      min: 0, max: 0.5, step: 0.01,
    });
    layout.addBinding(layoutParams, "bgDim", {
      label: "bg dim",
      min: 0, max: 1, step: 0.01,
    });
    layout.addBinding(layoutParams, "bodyTextAlpha", {
      label: "body brightness",
      min: 0, max: 1, step: 0.01,
    });
  }

  // Text content — per-scene wording. Single-line inputs; pipe ("|") and
  // newline ("\n") aren't auto-split here, you can paste paragraphs as-is.
  if (textContent) {
    const heroText = pane.addFolder({ title: "Text — Hero", expanded: false });
    heroText.addBinding(textContent.hero, "eyebrow",    { label: "eyebrow" });
    heroText.addBinding(textContent.hero, "titleLine1", { label: "title 1" });
    heroText.addBinding(textContent.hero, "titleLine2", { label: "title 2" });
    heroText.addBinding(textContent.hero, "tagline",    { label: "tagline" });
    heroText.addBinding(textContent.hero, "body",       { label: "body" });

    const aboutText = pane.addFolder({ title: "Text — About", expanded: false });
    aboutText.addBinding(textContent.about, "eyebrow",    { label: "eyebrow" });
    aboutText.addBinding(textContent.about, "titleLine1", { label: "title 1" });
    aboutText.addBinding(textContent.about, "titleLine2", { label: "title 2" });
    aboutText.addBinding(textContent.about, "body",       { label: "body" });

    if (textContent.portfolio) {
      const portfolioText = pane.addFolder({ title: "Text — Portfolio", expanded: false });
      portfolioText.addBinding(textContent.portfolio, "eyebrow",    { label: "eyebrow" });
      portfolioText.addBinding(textContent.portfolio, "titleLine1", { label: "title 1" });
      portfolioText.addBinding(textContent.portfolio, "titleLine2", { label: "title 2" });
      portfolioText.addBinding(textContent.portfolio, "tagline",    { label: "tagline" });
      portfolioText.addBinding(textContent.portfolio, "body",       { label: "body" });
    }

    if (textContent.clients) {
      const clientsText = pane.addFolder({ title: "Text — Clients", expanded: false });
      clientsText.addBinding(textContent.clients, "eyebrow",    { label: "eyebrow" });
      clientsText.addBinding(textContent.clients, "titleLine1", { label: "title 1" });
      clientsText.addBinding(textContent.clients, "titleLine2", { label: "title 2" });
      clientsText.addBinding(textContent.clients, "tagline",    { label: "tagline" });
      clientsText.addBinding(textContent.clients, "body",       { label: "body" });
    }
  }

  const addCarouselItemsFolder = (folderTitle, carousel, items) => {
    if (!carousel || !Array.isArray(items)) return;
    const folder = pane.addFolder({ title: folderTitle, expanded: false });
    items.forEach((item, i) => {
      const sub = folder.addFolder({
        title: `${String(i + 1).padStart(2, "0")} · ${item.title || "Untitled"}`,
        expanded: false,
      });
      sub.addBinding(item, "title",   { label: "title" });
      sub.addBinding(item, "tagline", { label: "tagline" });
      sub.addBinding(item, "image",   { label: "image path" });
      sub.on("change", () => carousel.update(items));
    });
  };

  addCarouselItemsFolder("Portfolio items", portfolio, portfolioItems);
  addCarouselItemsFolder("Client items", clients, clientItems);

  // Persistence: save all current params to localStorage whenever any
  // pane binding changes. Debounced so dragging a slider doesn't write
  // to storage 60 times per second.
  let saveTimer = null;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      savePreferences({
        fluid: fluid.params,
        snap: snap?.params,
        layout: layoutParams,
        text: textContent,
        tunnel: particles?.params,
        portfolio: portfolioItems,
        clients: clientItems,
      });
    }, 250);
  };
  pane.on("change", () => {
    // Layout/text values must take effect immediately (CSS variables / DOM
    // text); other bindings already mutate live via their bound objects.
    if (layoutParams) applyLayoutParams(layoutParams);
    if (textContent) applyTextContent(textContent);
    scheduleSave();
  });

  // Reset button — clears storage and reloads to bring everything back to defaults
  pane.addBlade({ view: "separator" });
  pane.addButton({ title: "Reset to defaults" }).on("click", () => {
    clearTimeout(saveTimer);
    clearPreferences();
    location.reload();
  });

  function syncVisibility() {
    velScaleBinding.hidden    = !usesVelocityScale(p.overlayStyle);
    cursorColorBinding.hidden = !usesCursorColor(p.overlayStyle);
    vibranceBinding.hidden    = !usesVibrance(p.overlayStyle);
    liquidColorBinding.hidden = p.overlayStyle !== "liquidLens";
  }
  syncVisibility();

  // Toggle key: ] (settings gear button stays hidden in the header).
  let visible = false;
  const setVisible = (v) => {
    visible = v;
    container.classList.toggle("is-open", visible);
  };
  setVisible(false);

  const onKey = (e) => {
    // Only toggle when not typing in an input
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.key === "]") {
      setVisible(!visible);
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", onKey);

  return {
    pane,
    container,
    show: () => setVisible(true),
    hide: () => setVisible(false),
    toggle: () => setVisible(!visible),
    dispose() {
      window.removeEventListener("keydown", onKey);
      pane.dispose();
      container.remove();
    },
  };
}
