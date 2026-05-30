/* ============================================================
   Snap-scroll controller
   ------------------------------------------------------------
   Captures wheel / touch / keyboard input, prevents native
   scrolling, and runs a choreographed GSAP transition between
   sections:
       outgoing text slides out to the left
       particle field transitions cloud -> tunnel (or back)
       incoming text slides in from the right
   ============================================================ */
import { gsap } from "gsap";

const SWIPE_THRESHOLD = 60;             // px - touch
const DEFAULT_WHEEL_THRESHOLD = 40;     // accumulated deltaY before a snap (configurable per instance)
const TRANSITION_DURATION = 1.6;        // seconds, total
const COOLDOWN_AFTER = 250;             // ms input lockout after a snap
const WHEEL_RESET_DELAY_MS = 220;       // ms of no input before the accumulator resets

export class SnapScroll {
  constructor(opts) {
      this.particles = opts.particles;          // ParticleSystem instance
      this.portfolio = opts.portfolio || null;  // Portfolio carousel (optional)
      this.clients = opts.clients || null;      // Clients carousel (optional)
      this.sections = Array.from(document.querySelectorAll(".section"));
      this.dots = Array.from(document.querySelectorAll(".nav-dot"));
      this.scrollHint = document.querySelector(".scroll-hint");
      this.current = 0;
      this.transitioning = false;
      this.lockUntil = 0;

      // User-tunable scroll behaviour. `opts.params` is the persisted
      // snapshot (if any); `opts.wheelThreshold` is a direct override.
      const savedParams = opts.params || {};
      this.params = {
        wheelThreshold: Math.max(
          1,
          savedParams.wheelThreshold ??
            opts.wheelThreshold ??
            DEFAULT_WHEEL_THRESHOLD
        ),
      };

      // Page-level layout/animation tuning shared with main.js (live-mutated
      // by Tweakpane). Read at animation-build time, so changes affect the
      // next intro / transition.
      this.layoutParams = opts.layoutParams || {};

      // Wheel accumulator (resets when direction flips or after a pause)
      this.wheelAccum = 0;
      this.wheelLastSign = 0;
      this.wheelResetTimer = null;

      // Each section's transition target for particles: 0 = cloud, 1 = tunnel.
      // Sections beyond the second keep tunnel mode under the bg fade-out.
      this.modeForSection = this.sections.map((sec) => {
        if (sec.classList.contains("section--hero")) return 0;
        return 1;
      });

      this._prepInitial();
      this._bindEvents();
    }

    _prepInitial() {
      // Hide every section except the first
      this.sections.forEach((sec, i) => {
        const stage = sec.querySelector(".text-stage");
        const axis = sec.dataset.axis || "x";
        if (i === 0) {
          sec.classList.add("is-active");
          gsap.set(sec, { autoAlpha: 1 });
          gsap.set(stage, { x: 0, y: 0, opacity: 1 });
          this._setLineState(sec, 1); // lines fully revealed
        } else {
          sec.classList.remove("is-active");
          gsap.set(sec, { autoAlpha: 0 });
          if (axis === "y") {
            gsap.set(stage, { x: 0, y: "100vh", opacity: 0 });
          } else {
            gsap.set(stage, { x: "100vw", y: 0, opacity: 0 });
          }
          this._setLineState(sec, 0); // lines hidden below their masks
        }
      });

      // Park carousel sections off-screen so their entrance has somewhere to come from.
      if (this.portfolio) this.portfolio.resetForEnter();
      if (this.clients) this.clients.resetForEnter();

      // Animate the first hero in on load for a nice entrance
      this._introAnimate(this.sections[0]);
    }

    _carouselForSection(sectionEl) {
      if (!sectionEl) return null;
      if (sectionEl.classList.contains("section--portfolio")) return this.portfolio;
      if (sectionEl.classList.contains("section--clients")) return this.clients;
      return null;
    }

    _setLineState(section, t) {
      // t = 0 hidden (lines pushed down), t = 1 revealed
      const lines = section.querySelectorAll(".display-title .line");
      lines.forEach((el) => {
        // Each line element is a block with overflow:hidden.
        // Animate its child text wrapper instead -- here we use the
        // line's own transform for simplicity (the parent clips).
        gsap.set(el, { y: t === 1 ? "0%" : "100%" });
      });
    }

    _introAnimate(section) {
      const stage = section.querySelector(".text-stage");
      const lines = section.querySelectorAll(".display-title .line");
      const eyebrow = section.querySelector(".eyebrow");
      const tagline = section.querySelector(".tagline");
      const body = section.querySelector(".body-copy");

      const stag = this.layoutParams.textStaggerScale ?? 1;
      const lineStag = this.layoutParams.lineStagger ?? 0.12;

      gsap.set(stage, { x: "12vw", opacity: 0 });
      gsap.set(lines, { y: "100%" });
      gsap.set([eyebrow, tagline, body].filter(Boolean), { y: 28, opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(stage, { x: 0, opacity: 1, duration: 1.2 }, 0)
        .to(eyebrow, { y: 0, opacity: 1, duration: 0.7 }, 0.15 * stag)
        .to(lines, { y: "0%", duration: 0.95, stagger: lineStag }, 0.3 * stag)
        .to(tagline, { y: 0, opacity: 1, duration: 0.8 }, 0.7 * stag)
        .to(body, { y: 0, opacity: 1, duration: 0.9 }, 1.0 * stag);

      return tl;
    }

    _bindEvents() {
      // Wheel
      window.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          this._onWheel(e);
        },
        { passive: false }
      );

      // Keyboard
      window.addEventListener("keydown", (e) => this._onKey(e));

      // Touch
      let touchStartY = null;
      window.addEventListener("touchstart", (e) => {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });
      window.addEventListener("touchmove", (e) => { e.preventDefault(); }, { passive: false });
      window.addEventListener("touchend", (e) => {
        if (touchStartY == null) return;
        const dy = (e.changedTouches[0].clientY - touchStartY);
        if (Math.abs(dy) > SWIPE_THRESHOLD) {
          this.go(dy < 0 ? +1 : -1);
        }
        touchStartY = null;
      });

      // Nav dots
      this.dots.forEach((dot) => {
        dot.addEventListener("click", () => {
          const idx = parseInt(dot.dataset.section, 10);
          this.goTo(idx);
        });
      });
    }

    _onWheel(e) {
      if (this._inputLocked()) return;
      const dy = e.deltaY;
      if (!dy) return;
      const sign = Math.sign(dy);
      if (sign !== this.wheelLastSign) {
        this.wheelAccum = 0;
        this.wheelLastSign = sign;
      }
      this.wheelAccum += dy;

      // Auto-reset accumulator if user pauses
      clearTimeout(this.wheelResetTimer);
      this.wheelResetTimer = setTimeout(() => {
        this.wheelAccum = 0;
        this.wheelLastSign = 0;
      }, WHEEL_RESET_DELAY_MS);

      const threshold = Math.max(1, this.params.wheelThreshold);
      if (Math.abs(this.wheelAccum) >= threshold) {
        const dir = this.wheelAccum > 0 ? +1 : -1;
        this.wheelAccum = 0;
        this.wheelLastSign = 0;
        this.go(dir);
      }
    }

    _onKey(e) {
      const k = e.key;
      if (this._inputLocked()) return;
      if (k === "ArrowDown" || k === "PageDown" || k === " ") { e.preventDefault(); this.go(+1); }
      else if (k === "ArrowUp" || k === "PageUp") { e.preventDefault(); this.go(-1); }
      else if (k === "Home") { e.preventDefault(); this.goTo(0); }
      else if (k === "End")  { e.preventDefault(); this.goTo(this.sections.length - 1); }
    }

    _inputLocked() {
      return this.transitioning || performance.now() < this.lockUntil;
    }

    go(dir) {
      const next = this.current + dir;
      if (next < 0 || next >= this.sections.length) return;
      this.goTo(next);
    }

    goTo(idx) {
      if (idx === this.current || this._inputLocked()) return;
      if (idx < 0 || idx >= this.sections.length) return;
      this._transition(this.current, idx);
    }

    _transition(fromIdx, toIdx) {
      this.transitioning = true;
      const dir = toIdx > fromIdx ? +1 : -1;
      const from = this.sections[fromIdx];
      const to   = this.sections[toIdx];

      // Hide scroll hint after the first transition
      if (this.scrollHint) this.scrollHint.classList.add("is-hidden");

      // Update dots immediately for responsive feedback
      this.dots.forEach((d, i) => d.classList.toggle("is-active", i === toIdx));

      to.classList.add("is-active");
      gsap.set(to, { autoAlpha: 1 });

      const fromStage = from.querySelector(".text-stage");
      const toStage = to.querySelector(".text-stage");

      const fromAxis = from.dataset.axis || "x";
      const toAxis   = to.dataset.axis   || "x";

      // Direction-aware travel for horizontal-axis sections.
      const exitToX   = dir > 0 ? "-110vw" : "110vw";
      const enterFromX = dir > 0 ? "110vw" : "-110vw";
      // Vertical-axis sections always come up from the bottom and exit downward,
      // independent of scroll direction. (User-requested behaviour for the
      // portfolio scene: text rises from below regardless of where you're
      // coming from.)
      const exitToY    = "100vh";
      const enterFromY = "100vh";

      if (toAxis === "y") {
        gsap.set(toStage, { x: 0, y: enterFromY, opacity: 1 });
      } else {
        gsap.set(toStage, { x: enterFromX, y: 0, opacity: 1 });
      }
      // Make sure incoming title lines start hidden behind their masks
      to.querySelectorAll(".display-title .line").forEach((el) => gsap.set(el, { y: "100%" }));
      // And other content slightly offset for a richer entrance
      [to.querySelector(".eyebrow"), to.querySelector(".tagline"), to.querySelector(".body-copy")]
        .filter(Boolean)
        .forEach((el) => gsap.set(el, { y: 28, opacity: 0 }));

      // Park the destination carousel before its entrance so the spin-in can run.
      const toCarousel = this._carouselForSection(to);
      if (toCarousel) toCarousel.resetForEnter();

      // Particle transition target (0 cloud, 1 tunnel)
      const particleFrom = this.modeForSection[fromIdx];
      const particleTo = this.modeForSection[toIdx];

      // Background canvas opacity targets — sections marked data-bg="blank"
      // hide the bg/fluid canvases entirely (e.g. portfolio scene).
      const fromBgOpacity = (from.dataset.bg === "blank") ? 0 : 1;
      const toBgOpacity   = (to.dataset.bg   === "blank") ? 0 : 1;

      // Choreographed timeline
      const tl = gsap.timeline({
        defaults: { ease: "power3.inOut" },
        onComplete: () => {
          from.classList.remove("is-active");
          gsap.set(from, { autoAlpha: 0 });
          this.current = toIdx;
          this.transitioning = false;
          this.lockUntil = performance.now() + COOLDOWN_AFTER;
        },
      });

      // 1. Outgoing text exits along its own axis.
      if (fromAxis === "y") {
        tl.to(fromStage, { y: exitToY, duration: TRANSITION_DURATION * 0.55, ease: "power2.in" }, 0);
      } else {
        tl.to(fromStage, { x: exitToX, duration: TRANSITION_DURATION * 0.55, ease: "power2.in" }, 0);
      }

      // 1b. Spin boost: ramp up while text slides out, ramp down during slide-in.
      // Drives a 0..1..0 envelope which the fluid scene lerps toward `transitionSpinTarget`.
      const spinDriver = { v: 0 };
      const notifySpin = () => {
        if (this.particles && typeof this.particles.setTransitionSpinProgress === "function") {
          this.particles.setTransitionSpinProgress(spinDriver.v);
        }
      };
      tl.to(spinDriver, {
        v: 1,
        duration: TRANSITION_DURATION * 0.55,
        ease: "sine.in",
        onUpdate: notifySpin,
      }, 0);
      tl.to(spinDriver, {
        v: 0,
        duration: TRANSITION_DURATION * 0.45,
        ease: "sine.out",
        onUpdate: notifySpin,
        onComplete: notifySpin,
      }, TRANSITION_DURATION * 0.55);

      // 2. Particle field morphs (cloud <-> tunnel) overlapping the text exit
      tl.to(
        this.particles,
        {
          transitionT: particleTo,
          duration: TRANSITION_DURATION * 0.9,
          ease: "power2.inOut",
          onUpdate: () => this.particles.setTransition(this.particles.transitionT),
        },
        0.1
      );

      // 3. Incoming text slides in from opposite side and content reveals.
      //    The pieces are revealed in visible reading order with a clear
      //    stagger between each: eyebrow → title lines → tagline → body.
      if (toAxis === "y") {
        tl.to(toStage, { y: 0, duration: TRANSITION_DURATION * 0.7, ease: "power3.out" }, TRANSITION_DURATION * 0.45);
      } else {
        tl.to(toStage, { x: 0, duration: TRANSITION_DURATION * 0.7, ease: "power3.out" }, TRANSITION_DURATION * 0.45);
      }

      // 2b. Background fade — overlapping the slide-out so the canvas blanks
      //     out before the destination text settles. Only animates if the
      //     start and end states differ.
      if (fromBgOpacity !== toBgOpacity && this.particles && this.particles.setBgOpacity) {
        const bgDriver = { v: fromBgOpacity };
        tl.to(bgDriver, {
          v: toBgOpacity,
          duration: TRANSITION_DURATION * 0.7,
          ease: "power2.inOut",
          onUpdate: () => this.particles.setBgOpacity(bgDriver.v),
          onComplete: () => this.particles.setBgOpacity(toBgOpacity),
        }, 0.1);
      }

      const stag = this.layoutParams.textStaggerScale ?? 1;
      const lineStag = this.layoutParams.lineStagger ?? 0.12;
      const slideIn = TRANSITION_DURATION * 0.55;
      const toEyebrow = to.querySelector(".eyebrow");
      const toTagline = to.querySelector(".tagline");
      const toBody = to.querySelector(".body-copy");
      const toLines = to.querySelectorAll(".display-title .line");

      if (toEyebrow) {
        tl.to(toEyebrow, { y: 0, opacity: 1, duration: 0.65, ease: "power3.out" }, slideIn);
      }
      if (toLines.length) {
        tl.to(toLines, { y: "0%", duration: 0.9, stagger: lineStag, ease: "power3.out" }, slideIn + 0.15 * stag);
      }
      if (toTagline) {
        tl.to(toTagline, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out" }, slideIn + 0.4 * stag);
      }
      if (toBody) {
        tl.to(toBody, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }, slideIn + 0.6 * stag);
      }

      // 4. Carousel scenes: spin-in when entering; fade-out when leaving.
      const fromCarousel = this._carouselForSection(from);
      const enterCarousel = this._carouselForSection(to);
      if (enterCarousel) {
        const enterTl = enterCarousel.enterTimeline();
        enterTl.play();
        tl.add(enterTl, slideIn + 0.7 * stag);
      }
      if (fromCarousel) {
        const exitTl = fromCarousel.exitTimeline();
        exitTl.play();
        tl.add(exitTl, 0);
      }
    }
  }

