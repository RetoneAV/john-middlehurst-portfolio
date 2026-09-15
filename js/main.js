/* ============================================================
   Application bootstrap
   ------------------------------------------------------------
   Owns the two background canvases and coordinates them:
     * #fluid-canvas (WebGPU) — the Mega-demo-style fluid scene
       used for the hero. Used only when WebGPU is supported.
     * #bg-canvas (WebGL) — always present. Hosts the tunnel
       particles (for the About scene) and the vortex fallback
       when WebGPU isn't available.
   ============================================================ */
import { gsap } from "gsap";
import { ParticleSystem } from "./particles.js";
import { SnapScroll } from "./scroll.js";
import { FluidScene } from "./fluid.js";
import { PortfolioCarousel } from "./portfolio.js";
import { PortfolioGrid } from "./portfolio-grid.js";
import { mountTweakpane } from "./tweakpane-controls.js";
import { mountContactButtons } from "./contact.js";
import {
  loadPreferences,
  applyLayoutParams,
  applyTextContent,
  mergeTextContent,
  mergePortfolioItems,
  mergeClientItems,
} from "./preferences.js";
import { SITE_DEFAULTS } from "../config/site-defaults.js";

const fluidCanvas = document.getElementById("fluid-canvas");
const bgCanvas = document.getElementById("bg-canvas");

/** Keep CSS viewport units aligned with the visible area (mobile URL bar, etc.). */
function updateViewportMetrics() {
  const vv = window.visualViewport;
  const h = vv?.height ?? window.innerHeight;
  const w = vv?.width ?? window.innerWidth;
  const root = document.documentElement;
  root.style.setProperty("--app-height", `${Math.round(h)}px`);
  root.style.setProperty("--app-width", `${Math.round(w)}px`);
}

if (!bgCanvas) {
  throw new Error("Background canvas (#bg-canvas) not found.");
}

// Load persisted preferences from localStorage, falling back to the committed
// production snapshot in config/site-defaults.js for any missing sections.
const storedPrefs = loadPreferences();
const savedPrefs = {
  fluid:     { ...SITE_DEFAULTS.fluid,     ...(storedPrefs?.fluid     || {}) },
  layout:    { ...SITE_DEFAULTS.layout,    ...(storedPrefs?.layout    || {}) },
  tunnel:    { ...SITE_DEFAULTS.tunnel,    ...(storedPrefs?.tunnel    || {}) },
  text:      mergeTextContent(storedPrefs?.text),
  portfolio: mergePortfolioItems(storedPrefs?.portfolio),
  clients:   mergeClientItems(storedPrefs?.clients),
  snap:      { ...SITE_DEFAULTS.snap,      ...(storedPrefs?.snap      || {}) },
};

// Apply layout params before first paint so the page lays out correctly on load
updateViewportMetrics();
const layoutParams = { ...savedPrefs.layout };
applyLayoutParams(layoutParams);

// Build the text-content object (merged with defaults) and write it into the
// DOM before any GSAP animations run.
const textContent = savedPrefs.text;
applyTextContent(textContent);
mountContactButtons();

// Portfolio items (merged with defaults) — used by the carousel and shown in
// Tweakpane so each card's text can be edited live.
const portfolioItems = savedPrefs.portfolio;
const clientItems = savedPrefs.clients;

const prefersReducedMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const particles = new ParticleSystem(bgCanvas, {
  count: prefersReducedMotion ? 0 : 9000,
  params: savedPrefs.tunnel,
});

function bindViewportMetrics() {
  const onViewportChange = () => {
    updateViewportMetrics();
    particles.resize();
    fluid?.ready && fluid._resize?.();
  };
  updateViewportMetrics();
  window.addEventListener("resize", onViewportChange, { passive: true });
  window.visualViewport?.addEventListener("resize", onViewportChange, { passive: true });
  window.visualViewport?.addEventListener("scroll", onViewportChange, { passive: true });
}
bindViewportMetrics();

const portfolioSection = document.querySelector(".section--portfolio");
const portfolio = portfolioSection
  ? new PortfolioGrid({
      section: portfolioSection,
      items: portfolioItems,
    })
  : null;

const clientsSection = document.querySelector(".section--clients");
const clients = clientsSection
  ? new PortfolioCarousel({
      section: clientsSection,
      items: clientItems,
      clickToCenter: false,
      autoRotate: true,
      autoRotateInterval: 2000,
    })
  : null;

// -- Mouse tracking (normalized -1..1) ---------------------------------
const mouse = { x: 0, y: 0 };
function onPointerMove(e) {
  const x = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
  const y = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
  mouse.x = (x / window.innerWidth) * 2 - 1;
  mouse.y = -((y / window.innerHeight) * 2 - 1);
  particles.setMouse(mouse.x, mouse.y);
}
window.addEventListener("pointermove", onPointerMove, { passive: true });
window.addEventListener("touchmove", onPointerMove, { passive: true });
window.addEventListener("pointerleave", () => particles.setMouse(0, 0));
window.addEventListener("blur", () => particles.setMouse(0, 0));

// Declared before SnapScroll so applySectionState can read it during
// construction. The WebGPU scene is created after snap exists.
let fluid = null;

// -- Background controller wrapper for scroll.js ------------------------
// SnapScroll tweens `transitionT` on this object. We propagate to the
// particle system and (if present) to the fluid canvas's opacity.
const backgroundController = {
  _bgOpacity: 1,

  get transitionT() {
    return particles.transitionT;
  },
  set transitionT(t) {
    particles.setTransition(t);
    this._syncFluidCanvasOpacity();
  },
  setTransition(t) {
    this.transitionT = t;
  },
  setTransitionSpinProgress(t) {
    if (fluid) fluid.setTransitionSpinProgress(t);
    particles.setTransitionSpinProgress(t);
  },
  /** Combined canvas + fluid visibility for blank-background sections. */
  setBgOpacity(v) {
    this._bgOpacity = Math.max(0, Math.min(1, v));
    document.documentElement.style.setProperty(
      "--bg-opacity",
      String(this._bgOpacity)
    );
    const pe = this._bgOpacity > 0.01 ? "auto" : "none";
    const fluidCanvas = document.getElementById("fluid-canvas");
    const bgCanvas = document.getElementById("bg-canvas");
    if (fluidCanvas) fluidCanvas.style.pointerEvents = pe;
    if (bgCanvas) bgCanvas.style.pointerEvents = pe;
    this._syncFluidCanvasOpacity();
  },
  _syncFluidCanvasOpacity() {
    if (!fluid) return;
    const heroAlpha = 1 - Math.max(0, Math.min(1, this.transitionT));
    const target = fluid.opacityTarget ?? 1;
    fluid.setOpacity(heroAlpha * target * this._bgOpacity);
  },
  /** Apply particle mode + canvas visibility for a section index. */
  applySectionState(sectionEl, particleT) {
    const blank = sectionEl?.dataset.bg === "blank";
    const t = blank ? 0 : particleT;
    this.setBgOpacity(blank ? 0 : 1);
    this.setTransition(t);
    if (typeof this.setTransitionSpinProgress === "function") {
      this.setTransitionSpinProgress(0);
    }
  },
};

const HASH_SECTIONS = {
  portfolio: 2,
  clients: 3,
  about: 1,
  hero: 0,
  intro: 0,
};

function resolveInitialSection() {
  try {
    const returnKey = sessionStorage.getItem("jm-return-section");
    if (returnKey) {
      sessionStorage.removeItem("jm-return-section");
      const fromStore = HASH_SECTIONS[returnKey.toLowerCase()];
      if (typeof fromStore === "number") return fromStore;
    }
  } catch {
    // ignore
  }

  const hashKey = window.location.hash.replace(/^#/, "").toLowerCase();
  if (!hashKey) return 0;
  const fromHash = HASH_SECTIONS[hashKey] ?? parseInt(hashKey, 10);
  return Number.isFinite(fromHash) && fromHash > 0 ? fromHash : 0;
}

const initialSection = resolveInitialSection();

const snap = new SnapScroll({
  particles: backgroundController,
  portfolio,
  clients,
  params: savedPrefs.snap,
  layoutParams,
  initialSection,
});

// -- Optional WebGPU fluid scene ---------------------------------------
const webgpuSupported = FluidScene.isSupported() && fluidCanvas && !prefersReducedMotion;
if (webgpuSupported) {
  fluid = new FluidScene(fluidCanvas, { params: savedPrefs.fluid });
  particles.heroMode = "fluid";
  fluid.setOpacity(0);
  fluid.opacityTarget = 0;

  fluid
    .init()
    .then(() => {
      const onHero = snap.current === 0;
      if (onHero) {
        fluid.opacityTarget = 1;
        gsap.to(fluid, {
          opacityTarget: 1,
          duration: 1.0,
          ease: "power2.out",
          onUpdate: () => backgroundController._syncFluidCanvasOpacity(),
        });
      } else {
        fluid.opacityTarget = 0;
        backgroundController._syncFluidCanvasOpacity();
      }

      try {
        mountTweakpane(
          fluid,
          snap,
          layoutParams,
          textContent,
          particles,
          portfolio,
          portfolioItems,
          clients,
          clientItems
        );
      } catch (err) {
        console.warn("Tweakpane mount failed; fluid scene still running.", err);
      }
    })
    .catch((err) => {
      console.warn("FluidScene init failed; falling back to vortex.", err);
      fluid.dispose?.();
      fluid = null;
      particles.heroMode = "vortex";
      if (fluidCanvas) fluidCanvas.style.display = "none";
    });
} else {
  if (fluidCanvas) fluidCanvas.style.display = "none";
  particles.heroMode = "vortex";
}

// Expose for debugging
window.__app = { particles, fluid, snap, portfolio, clients, background: backgroundController };

// -- Animation loop ------------------------------------------------------
let last = performance.now();
function tick(now) {
  const dt = Math.max(0, (now - last) / 1000);
  last = now;
  particles.update(dt);
  if (fluid && fluid.ready) fluid.update(dt);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Lower DPR on low-end devices
if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
  particles.setDpr(1.25);
}
