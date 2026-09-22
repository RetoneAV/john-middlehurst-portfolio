/* ============================================================
   Shared bootstrap for individual portfolio pages
   ============================================================ */
import { mountContactButtons } from "./contact.js";

mountContactButtons();

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
