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
import { mountTweakpane } from "./tweakpane-controls.js";
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

// Portfolio carousel (scene 2). Lives in normal DOM, no canvas needed; uses
// CSS 3D transforms driven by a single --carousel-angle on the track element.
const portfolioSection = document.querySelector(".section--portfolio");
const portfolio = portfolioSection
  ? new PortfolioCarousel({ section: portfolioSection, items: portfolioItems })
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

// -- Optional WebGPU fluid scene ---------------------------------------
let fluid = null;
const webgpuSupported = FluidScene.isSupported() && fluidCanvas && !prefersReducedMotion;
if (webgpuSupported) {
  fluid = new FluidScene(fluidCanvas, { params: savedPrefs.fluid });
  particles.heroMode = "fluid"; // skip the vortex on the bg-canvas; fluid handles the hero
  fluid.setOpacity(0);          // fade in once initialised

  // Initialise async; failures fall back to the vortex
  fluid
    .init()
    .then(() => {
      // Fade fluid in over ~1 second
      gsap.to(fluid, {
        opacityTarget: 1,
        duration: 1.0,
        ease: "power2.out",
        onUpdate: () => fluid.setOpacity(fluid.opacityTarget),
      });
      // Tweakpane is a dev tool — if it fails to mount, log and keep going.
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
  // No WebGPU (or reduced motion). Use the existing vortex on the WebGL canvas.
  if (fluidCanvas) fluidCanvas.style.display = "none";
  particles.heroMode = "vortex";
}

// -- Background controller wrapper for scroll.js ------------------------
// SnapScroll tweens `transitionT` on this object. We propagate to the
// particle system and (if present) to the fluid canvas's opacity.
// `setTransitionSpinProgress` is called by SnapScroll's transition timeline
// to drive a temporary spin boost on the fluid scene during the text
// slide-out / slide-in phases.
const backgroundController = {
  get transitionT() {
    return particles.transitionT;
  },
  set transitionT(t) {
    particles.setTransition(t);
    if (fluid) {
      // Hero (t=0): fluid fully visible. About (t=1): fluid hidden.
      // Multiply by fluid's own intro fade target so the initial fade-in still applies.
      const heroAlpha = 1 - Math.max(0, Math.min(1, t));
      fluid.setOpacity(heroAlpha * (fluid.opacityTarget ?? 1));
    }
  },
  setTransition(t) {
    this.transitionT = t;
  },
  setTransitionSpinProgress(t) {
    if (fluid) fluid.setTransitionSpinProgress(t);
    particles.setTransitionSpinProgress(t);
  },
  /** 0..1 visibility for the bg + fluid canvases. SnapScroll fades it down
   *  when entering a section marked data-bg="blank" (e.g. portfolio). */
  setBgOpacity(v) {
    document.documentElement.style.setProperty(
      "--bg-opacity",
      String(Math.max(0, Math.min(1, v)))
    );
  },
};

const snap = new SnapScroll({
  particles: backgroundController,
  portfolio,
  clients,
  params: savedPrefs.snap,
  layoutParams,
});

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
