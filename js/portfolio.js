/* ============================================================
   Portfolio carousel (scene 2 / section 2)
   ------------------------------------------------------------
   Builds a 3D cylindrical carousel of N items inside the
   `.carousel-track` element. Items are evenly distributed
   around the cylinder using --item-angle on each card and a
   single --carousel-angle on the track that rotates them all.

   Interactions (intentionally restrained):
     - click any non-centre card  → snaps it to the centre
     - prev / next buttons        → snap one position in that direction
     - keyboard focus on a card   → centres it

   Each card only contains the artwork. The active item's title +
   tagline are rendered in a single `.carousel-caption` block below
   the stage, which fades while the new active item rotates in.
   ============================================================ */
import { gsap } from "gsap";

const SNAP_DURATION = 0.55;           // seconds per single-step snap
const SNAP_EASE = "power3.out";       // snappy out-ease
const CAPTION_HIDE_DELAY = 80;        // ms before showing new caption
const DEFAULT_AUTO_ROTATE_INTERVAL = 4500; // ms between auto-advance steps

/** Build a placeholder image data URI (encoded SVG) for the i-th item.
 *  Procedural HSL gradient + the item's *title* shown prominently, plus
 *  a small index badge in the corner so cards stay easy to identify even
 *  when titles get customised. */
function buildPlaceholder(index, title) {
  const hueA = (index * 37) % 360;
  const hueB = (hueA + 65) % 360;
  const indexBadge = String(index + 1).padStart(2, "0");
  const fallback = `Item ${indexBadge}`;
  const rawLabel = (title && String(title).trim()) || fallback;
  // Auto-shrink font for longer text so it doesn't overflow the card box.
  const fontSize = rawLabel.length <= 10 ? 92 : rawLabel.length <= 18 ? 64 : 44;
  // Minimal HTML/XML escaping for the user-supplied title.
  const safeLabel = rawLabel.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
        `<stop offset='0%' stop-color='hsl(${hueA},65%,42%)'/>` +
        `<stop offset='100%' stop-color='hsl(${hueB},70%,22%)'/>` +
      `</linearGradient></defs>` +
      `<rect width='100%' height='100%' fill='url(#g)'/>` +
      `<rect x='8' y='8' width='624' height='344' fill='none' stroke='rgba(255,255,255,0.10)' stroke-width='2' rx='12'/>` +
      `<text x='50%' y='52%' font-family='Inter,sans-serif' font-size='${fontSize}' font-weight='700' ` +
            `fill='rgba(255,255,255,0.92)' text-anchor='middle' dominant-baseline='central'>${safeLabel}</text>` +
      `<text x='28' y='52' font-family='Inter,sans-serif' font-size='32' font-weight='700' ` +
            `fill='rgba(255,255,255,0.55)'>${indexBadge}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Set a card image src, falling back to the procedural placeholder if the
 *  file is missing or fails to load. */
function setCardImage(imgEl, index, data) {
  const placeholder = buildPlaceholder(index, data?.title);
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = placeholder;
  };
  imgEl.src = data?.image || placeholder;
}

export class PortfolioCarousel {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.section          The host section element
   * @param {Array<{title:string,tagline:string,image?:string}>} opts.items
   * @param {boolean} [opts.clickToCenter=true] Click/focus snaps a card to centre
   * @param {boolean} [opts.autoRotate=false]   Auto-advance to the next item
   * @param {number}  [opts.autoRotateInterval] ms between auto-advance steps
   */
  constructor(opts) {
    this.section = opts.section;
    this.track = this.section.querySelector("[data-carousel-track]");
    this.stage = this.section.querySelector(".carousel-stage");
    this.controls = this.section.querySelectorAll(".carousel-btn");
    this.caption = this.section.querySelector("[data-carousel-caption]");
    this.captionTitle = this.section.querySelector("[data-carousel-caption-title]");
    this.captionTagline = this.section.querySelector("[data-carousel-caption-tagline]");
    this.items = (opts.items || []).slice();
    this.clickToCenter = opts.clickToCenter !== false;
    this.autoRotate = opts.autoRotate === true;
    this.autoRotateInterval = opts.autoRotateInterval ?? DEFAULT_AUTO_ROTATE_INTERVAL;
    if (!this.track) throw new Error("Portfolio carousel: missing track element");

    this.count = this.items.length;
    this.itemAngleStep = 360 / Math.max(1, this.count);

    // Two parallel pieces of state:
    //   targetIndex  / targetAngle  → where we're heading (updated synchronously)
    //   activeIndex  / currentAngleDeg → what's actually on screen (tween-driven)
    // Splitting them fixes two bugs:
    //   1. Chained next/prev clicks during a tween used to chain off the old
    //      activeIndex, so they snapped to the wrong item.
    //   2. Interrupting a tween (e.g. the entrance spin) computed the new
    //      target relative to the mid-tween angle, leaving the carousel
    //      between two items.
    this.activeIndex = 0;
    this.targetIndex = 0;
    this.targetAngle = 0;       // canonical angle for targetIndex
    this.currentAngleDeg = 0;   // visual angle being interpolated
    this._tween = null;
    this._captionTimer = null;
    this._autoRotateTimer = null;
    this._autoRotateActive = false;
    this._cards = [];

    this._build();
    this._bindControls();
    this._setCaption(this.items[this.activeIndex], { instant: true });
  }

  /** Re-render the cards from fresh items data (preserves activeIndex). */
  update(items) {
    this.items = (items || []).slice();
    if (this.items.length !== this.count) {
      this.count = this.items.length;
      this.itemAngleStep = 360 / Math.max(1, this.count);
      this.activeIndex = Math.min(this.activeIndex, this.count - 1);
      this.targetIndex = this.activeIndex;
      this.targetAngle = -this.targetIndex * this.itemAngleStep;
      this._build();
      this._snapTo(this.activeIndex, { duration: 0 });
    } else {
      // Same count: patch image src + alt so customised titles are reflected
      // on the placeholder artwork as well as the caption.
      this._cards.forEach((card, i) => {
        const data = this.items[i];
        if (!data) return;
        const imgEl = card.querySelector(".carousel-item__img");
        if (imgEl) {
          setCardImage(imgEl, i, data);
          imgEl.alt = data.title ? `${data.title} preview` : `Portfolio item ${i + 1}`;
        }
        card.setAttribute(
          "aria-label",
          data.title ? `${data.title}: open` : `Portfolio item ${i + 1}: open`
        );
      });
    }
    // Refresh the caption since titles/taglines may have changed.
    this._setCaption(this.items[this.activeIndex], { instant: true });
  }

  /** Build the DOM once. Called on construction and on count change. */
  _build() {
    this.track.innerHTML = "";
    this._cards = [];

    for (let i = 0; i < this.count; i += 1) {
      const data = this.items[i] || {};
      const angleDeg = i * this.itemAngleStep;

      const card = document.createElement(this.clickToCenter ? "button" : "div");
      if (this.clickToCenter) card.type = "button";
      card.className = "carousel-item";
      card.setAttribute("role", this.clickToCenter ? "group" : "presentation");
      card.dataset.index = String(i);
      card.style.setProperty("--item-angle", `${angleDeg}deg`);
      card.setAttribute(
        "aria-label",
        data.title ? `${data.title}` : `Portfolio item ${i + 1}`
      );

      const media = document.createElement("div");
      media.className = "carousel-item__media";

      const img = document.createElement("img");
      img.className = "carousel-item__img";
      img.alt = data.title ? `${data.title} preview` : `Portfolio item ${i + 1}`;
      img.draggable = false;
      setCardImage(img, i, data);
      media.appendChild(img);

      card.appendChild(media);

      if (this.clickToCenter) {
        card.addEventListener("click", () => this._snapTo(i));
        card.addEventListener("focus", () => {
          if (i !== this.activeIndex) this._snapTo(i);
        });
      }

      this.track.appendChild(card);
      this._cards.push(card);
    }
    this._refreshCenterClass();
  }

  _bindControls() {
    if (!this.controls.length) return;
    this.controls.forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = parseInt(btn.dataset.carouselDir, 10);
        if (dir) this.go(dir);
      });
    });
  }

  /** +1 = step right (next), -1 = step left (prev). Chains off targetIndex
   *  rather than activeIndex so multiple clicks during a tween advance the
   *  carousel by N positions (not N times to the same neighbour). */
  go(dir) {
    const next = this.targetIndex + (dir > 0 ? 1 : -1);
    this._snapTo(next);
  }

  /** Snap the carousel so `targetIndex` is centred. The angle delta uses the
   *  shortest signed step around the cylinder so a tween never spins more
   *  than half a turn for a single jump. The new target angle is always a
   *  canonical position (an integer multiple of the step from the previous
   *  target), so the carousel can never settle between two items even when
   *  a snap interrupts another tween. */
  _snapTo(targetIndex, opts = {}) {
    if (this.count === 0) return;
    const normalised = ((targetIndex % this.count) + this.count) % this.count;
    if (normalised === this.targetIndex && opts.duration !== 0) return;

    let step = normalised - this.targetIndex;
    if (step > this.count / 2) step -= this.count;
    if (step < -this.count / 2) step += this.count;

    // Always advance from the previous *target* angle, not currentAngleDeg.
    // This guarantees we land on a canonical resting position even if we
    // interrupt an in-flight tween (entrance spin, prior snap, etc.).
    const newTargetAngle = this.targetAngle - step * this.itemAngleStep;

    // Sync state — published immediately so chained calls see the new target.
    this.targetIndex = normalised;
    this.targetAngle = newTargetAngle;

    if (this._tween) this._tween.kill();
    const duration = opts.duration ?? SNAP_DURATION;

    // Hide caption immediately so the old text doesn't linger while the
    // wrong card is at centre. The new caption fades in once the tween lands.
    this._fadeCaptionOut();

    if (duration <= 0) {
      this.currentAngleDeg = newTargetAngle;
      this.track.style.setProperty("--carousel-angle", `${newTargetAngle}deg`);
      this.activeIndex = normalised;
      this._refreshCenterClass();
      this._setCaption(this.items[this.activeIndex], { instant: true });
      this._onSnapSettled();
    } else {
      this._tween = gsap.to(this, {
        currentAngleDeg: newTargetAngle,
        duration,
        ease: opts.ease || SNAP_EASE,
        onUpdate: () => {
          this.track.style.setProperty(
            "--carousel-angle",
            `${this.currentAngleDeg}deg`
          );
        },
        onComplete: () => {
          // Clamp to the canonical target so any sub-pixel float drift from
          // the tween is erased — guarantees pixel-perfect centring.
          this.currentAngleDeg = newTargetAngle;
          this.track.style.setProperty("--carousel-angle", `${newTargetAngle}deg`);
          this.activeIndex = normalised;
          this._refreshCenterClass();
          this._setCaption(this.items[this.activeIndex]);
          this._onSnapSettled();
        },
      });
    }
  }

  _refreshCenterClass() {
    this._cards.forEach((card, i) => {
      card.classList.toggle("is-center", i === this.activeIndex);
      card.setAttribute("aria-current", i === this.activeIndex ? "true" : "false");
      card.tabIndex = this.clickToCenter ? (i === this.activeIndex ? 0 : -1) : -1;
    });
  }

  _startAutoRotate() {
    if (!this.autoRotate) return;
    this._autoRotateActive = true;
    this._scheduleAutoRotate();
  }

  _stopAutoRotate() {
    this._autoRotateActive = false;
    if (this._autoRotateTimer) {
      clearTimeout(this._autoRotateTimer);
      this._autoRotateTimer = null;
    }
  }

  _scheduleAutoRotate() {
    if (!this._autoRotateActive || !this.autoRotate) return;
    if (this._autoRotateTimer) clearTimeout(this._autoRotateTimer);
    this._autoRotateTimer = setTimeout(() => {
      this._autoRotateTimer = null;
      if (!this._autoRotateActive) return;
      this.go(1);
    }, this.autoRotateInterval);
  }

  _onSnapSettled() {
    if (this.autoRotate && this._autoRotateActive) {
      this._scheduleAutoRotate();
    }
  }

  // ---- Caption (active item title + tagline) ---------------------------

  _fadeCaptionOut() {
    if (!this.caption) return;
    this.caption.classList.remove("is-visible");
  }

  _setCaption(data, opts = {}) {
    if (!this.caption) return;
    if (this._captionTimer) {
      clearTimeout(this._captionTimer);
      this._captionTimer = null;
    }
    const apply = () => {
      if (this.captionTitle) this.captionTitle.textContent = data?.title || "";
      if (this.captionTagline) this.captionTagline.textContent = data?.tagline || "";
      this.caption.classList.add("is-visible");
    };
    if (opts.instant) {
      apply();
    } else {
      // Small delay so the fade-out can finish before the new text is shown.
      this._captionTimer = setTimeout(apply, CAPTION_HIDE_DELAY);
    }
  }

  getActiveIndex() {
    return this.activeIndex;
  }

  // ---- Entrance / exit choreography (called by SnapScroll) -------------

  /** Resets the carousel to its pre-entrance state (off-screen, behind cam).
   *  `targetAngle` is preserved — that's the canonical resting position we'll
   *  spin back to. `currentAngleDeg` is offset by 540° so the entrance plays
   *  as a 1.5-turn rotate-onto-screen. */
  resetForEnter() {
    this._stopAutoRotate();
    if (this._tween) this._tween.kill();
    this.currentAngleDeg = this.targetAngle + 540;
    this.track.style.setProperty("--carousel-angle", `${this.currentAngleDeg}deg`);
    if (this.stage) gsap.set(this.stage, { autoAlpha: 0 });
    this._fadeCaptionOut();
  }

  /** Entrance timeline: spin + fade in. Returns a GSAP timeline (paused). */
  enterTimeline() {
    const tl = gsap.timeline({ paused: true });
    const landing = this.targetAngle;
    if (this.stage) {
      tl.to(this.stage, { autoAlpha: 1, duration: 0.55, ease: "power2.out" }, 0);
    }
    tl.to(this, {
      currentAngleDeg: landing,
      duration: 1.1,
      ease: "power3.out",
      onUpdate: () => {
        this.track.style.setProperty(
          "--carousel-angle",
          `${this.currentAngleDeg}deg`
        );
      },
      onComplete: () => {
        this.currentAngleDeg = this.targetAngle;
        this.track.style.setProperty(
          "--carousel-angle",
          `${this.targetAngle}deg`
        );
        this._setCaption(this.items[this.activeIndex]);
        this._startAutoRotate();
      },
    }, 0);
    return tl;
  }

  /** Exit timeline: just fade out (cheap; we keep the angle so re-entry
   *  picks up from the same resting position). */
  exitTimeline() {
    this._stopAutoRotate();
    const tl = gsap.timeline({ paused: true });
    if (this.stage) {
      tl.to(this.stage, { autoAlpha: 0, duration: 0.4, ease: "power2.in" }, 0);
    }
    this._fadeCaptionOut();
    return tl;
  }
}
