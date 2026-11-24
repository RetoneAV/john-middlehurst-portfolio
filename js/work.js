/* ============================================================
   Shared bootstrap for individual portfolio pages
   ============================================================ */
import { mountContactButtons } from "./contact.js";
import { FluidScene } from "./fluid.js";
import { loadPreferences, applyLayoutParams } from "./preferences.js";
import { SITE_DEFAULTS } from "../config/site-defaults.js";

mountContactButtons();

/** The same fluid backdrop as the homepage, with the particle field left off. */
function mountWorkBackground() {
  const canvas = document.getElementById("fluid-canvas");
  if (!canvas || !FluidScene.isSupported()) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const stored = loadPreferences();
  applyLayoutParams({ ...SITE_DEFAULTS.layout, ...(stored?.layout || {}) });

  const fluid = new FluidScene(canvas, {
    params: {
      ...SITE_DEFAULTS.fluid,
      ...(stored?.fluid || {}),
      particlesEnabled: false,
    },
  });

  fluid
    .init()
    .then(() => {
      if (fluid.particles?.mesh) fluid.particles.mesh.visible = false;
    })
    .catch((err) => {
      console.warn("Project background failed to start.", err);
      canvas.style.display = "none";
    });

  const tick = () => {
    if (fluid.ready) fluid.update();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

mountWorkBackground();

/** Paint the first decoded frame so paused videos don't sit black. */
function paintVideoStartFrames() {
  document.querySelectorAll(".work-video video").forEach((video) => {
    if (video.getAttribute("poster") || video.autoplay) return;
    const paint = () => {
      if (video.readyState < 2) return;
      const t = Math.min(0.05, Math.max(0.001, (video.duration || 1) * 0.002));
      if (video.currentTime < 0.01) video.currentTime = t;
    };
    if (video.readyState >= 2) paint();
    else video.addEventListener("loadeddata", paint, { once: true });
  });
}

paintVideoStartFrames();
