/* ============================================================
   Clients wall (scene 3)
   ------------------------------------------------------------
   Every logo is on screen at once. Tile size is the largest
   square that still fits the leftover width and height, so a
   full-screen window cannot clip the bottom row.
   ============================================================ */
import { gsap } from "gsap";

function buildPlaceholder(index, title) {
  const hueA = (index * 37) % 360;
  const hueB = (hueA + 65) % 360;
  const indexBadge = String(index + 1).padStart(2, "0");
  const rawLabel = (title && String(title).trim()) || `Client ${indexBadge}`;
  const fontSize = rawLabel.length <= 10 ? 56 : rawLabel.length <= 18 ? 40 : 28;
  const safeLabel = rawLabel.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 640'>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
        `<stop offset='0%' stop-color='hsl(${hueA},65%,42%)'/>` +
        `<stop offset='100%' stop-color='hsl(${hueB},70%,22%)'/>` +
      `</linearGradient></defs>` +
      `<rect width='100%' height='100%' fill='url(#g)'/>` +
      `<text x='50%' y='52%' font-family='Inter,sans-serif' font-size='${fontSize}' font-weight='700' ` +
            `fill='rgba(255,255,255,0.92)' text-anchor='middle' dominant-baseline='central'>${safeLabel}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function setLogoImage(imgEl, index, data) {
  const placeholder = buildPlaceholder(index, data?.title);
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = placeholder;
  };
  imgEl.src = data?.image || placeholder;
}

function logoLabel(data, index) {
  const title = (data?.title && String(data.title).trim()) || "";
  return title || `Client logo ${index + 1}`;
}

export class ClientsWall {
  constructor(opts) {
    this.section = opts.section;
    this.wall = this.section.querySelector("[data-client-wall]");
    this.items = (opts.items || []).slice();
    this._tiles = [];
    this._ro = null;
    if (!this.wall) throw new Error("Clients wall: missing wall element");
    this._build();
    this._bindLayout();
  }

  update(items) {
    this.items = (items || []).slice();
    if (this.items.length !== this._tiles.length) {
      this._build();
      this._fit();
      return;
    }
    this._tiles.forEach((tile, i) => {
      const data = this.items[i];
      if (!data) return;
      const img = tile.querySelector(".client-logo__img");
      if (img) {
        setLogoImage(img, i, data);
        img.alt = logoLabel(data, i);
      }
      tile.setAttribute("aria-label", logoLabel(data, i));
    });
    this._fit();
  }

  resetForEnter() {
    this._tiles.forEach((tile) => {
      gsap.set(tile, { autoAlpha: 0, y: 22, scale: 0.96 });
    });
  }

  showImmediate() {
    this._fit();
    this._tiles.forEach((tile) => {
      gsap.set(tile, { clearProps: "transform,opacity,visibility", autoAlpha: 1, y: 0, scale: 1 });
    });
  }

  enterTimeline() {
    const tl = gsap.timeline({ paused: true });
    if (!this._tiles.length) return tl;
    tl.to(this._tiles, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.65,
      stagger: 0.035,
      ease: "power3.out",
      onComplete: () => {
        gsap.set(this._tiles, { clearProps: "transform,opacity,visibility" });
      },
    }, 0);
    return tl;
  }

  exitTimeline() {
    const tl = gsap.timeline({ paused: true });
    if (!this._tiles.length) return tl;
    tl.to(this._tiles, {
      autoAlpha: 0,
      y: 12,
      duration: 0.3,
      stagger: 0.015,
      ease: "power2.in",
    }, 0);
    return tl;
  }

  _bindLayout() {
    const fit = () => this._fit();
    if (typeof ResizeObserver === "function") {
      this._ro = new ResizeObserver(fit);
      this._ro.observe(this.wall);
    } else {
      window.addEventListener("resize", fit);
    }
    fit();
  }

  /** Largest square that fits every logo inside the wall box. */
  _fit() {
    const count = Math.max(1, this.items.length);
    const width = this.wall.clientWidth;
    const height = this.wall.clientHeight;
    if (!width || !height) return;

    const styles = getComputedStyle(this.wall);
    const gap = parseFloat(styles.columnGap || styles.gap) || 12;
    let bestCols = 1;
    let bestSize = 0;

    const maxCols = width < 520 ? 3 : width < 800 ? 4 : width < 1100 ? 5 : 6;
    for (let cols = 1; cols <= Math.min(count, maxCols); cols += 1) {
      const rows = Math.ceil(count / cols);
      const sizeW = (width - gap * (cols - 1)) / cols;
      const sizeH = (height - gap * (rows - 1)) / rows;
      const size = Math.floor(Math.min(sizeW, sizeH));
      if (size > bestSize) {
        bestSize = size;
        bestCols = cols;
      }
    }

    this.wall.style.setProperty("--client-cols", String(bestCols));
    this.wall.style.setProperty("--client-tile", `${Math.max(36, bestSize)}px`);
  }

  _build() {
    this.wall.innerHTML = "";
    this._tiles = [];

    this.items.forEach((data, i) => {
      const tile = document.createElement("figure");
      tile.className = "client-logo";
      tile.setAttribute("aria-label", logoLabel(data, i));

      const img = document.createElement("img");
      img.className = "client-logo__img";
      img.alt = logoLabel(data, i);
      img.draggable = false;
      setLogoImage(img, i, data);
      tile.appendChild(img);

      this.wall.appendChild(tile);
      this._tiles.push(tile);
    });
  }
}
