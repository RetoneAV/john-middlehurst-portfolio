/* ============================================================
   Portfolio grid (scene 2)
   ------------------------------------------------------------
   Responsive square tiles that grow with the viewport. Column
   count prefers even rows; leftover tiles stay centred. Hover
   is class-based so GSAP entrance tweens cannot leave a tile
   stuck in a hovered look.
   ============================================================ */
import { gsap } from "gsap";

function buildPlaceholder(index, title) {
  const hueA = (index * 37) % 360;
  const hueB = (hueA + 65) % 360;
  const indexBadge = String(index + 1).padStart(2, "0");
  const rawLabel = (title && String(title).trim()) || `Item ${indexBadge}`;
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

function setTileImage(imgEl, index, data) {
  const placeholder = buildPlaceholder(index, data?.title);
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = placeholder;
  };
  imgEl.src = data?.image || placeholder;
}

function itemHref(data) {
  const slug = String(data?.slug || "").trim();
  return slug ? `portfolio/${encodeURIComponent(slug)}.html` : "";
}

function rememberPortfolioReturn() {
  try {
    sessionStorage.setItem("jm-return-section", "portfolio");
  } catch {
    // ignore
  }
}

export class PortfolioGrid {
  constructor(opts) {
    this.section = opts.section;
    this.scrollEl = this.section.querySelector("[data-inner-scroll]");
    this.track = this.section.querySelector("[data-portfolio-track]");
    this.items = (opts.items || []).slice();
    this._tiles = [];
    this._ro = null;
    if (!this.track) throw new Error("Portfolio grid: missing track element");
    this._build();
    this._bindLayout();
  }

  update(items) {
    this.items = (items || []).slice();
    if (this.items.length !== this._tiles.length) {
      this._build();
      this._updateColumns();
      return;
    }
    this._tiles.forEach((tile, i) => {
      const data = this.items[i];
      if (!data) return;
      const img = tile.querySelector(".portfolio-tile__img");
      const title = tile.querySelector(".portfolio-tile__title");
      const tagline = tile.querySelector(".portfolio-tile__tagline");
      if (img) {
        setTileImage(img, i, data);
        img.alt = data.title ? `${data.title} preview` : `Portfolio item ${i + 1}`;
      }
      if (title) title.textContent = data.title || `Project ${String(i + 1).padStart(2, "0")}`;
      if (tagline) tagline.textContent = data.tagline || "";
      tile.setAttribute("aria-label", data.title || `Portfolio item ${i + 1}`);
      if (tile.tagName === "A") {
        const href = itemHref(data);
        if (href) tile.setAttribute("href", href);
      }
    });
    this._updateColumns();
  }

  getScrollElement() {
    return this.scrollEl;
  }

  resetForEnter() {
    if (this.scrollEl) this.scrollEl.scrollTop = 0;
    this._clearHover();
    this._tiles.forEach((tile) => {
      gsap.set(tile, { autoAlpha: 0, y: 28 });
    });
  }

  showImmediate() {
    if (this.scrollEl) this.scrollEl.scrollTop = 0;
    this._clearHover();
    this._tiles.forEach((tile) => {
      gsap.set(tile, { clearProps: "transform,opacity,visibility", autoAlpha: 1, y: 0 });
    });
  }

  enterTimeline() {
    const tl = gsap.timeline({ paused: true });
    if (!this._tiles.length) return tl;
    this._clearHover();
    tl.to(this._tiles, {
      autoAlpha: 1,
      y: 0,
      duration: 0.7,
      stagger: 0.045,
      ease: "power3.out",
      onComplete: () => {
        gsap.set(this._tiles, { clearProps: "transform,opacity,visibility" });
        this._clearHover();
      },
    }, 0);
    return tl;
  }

  exitTimeline() {
    const tl = gsap.timeline({ paused: true });
    if (!this._tiles.length) return tl;
    this._clearHover();
    tl.to(this._tiles, {
      autoAlpha: 0,
      y: 16,
      duration: 0.35,
      stagger: 0.02,
      ease: "power2.in",
    }, 0);
    return tl;
  }

  _clearHover() {
    this._tiles.forEach((tile) => {
      tile.classList.remove("is-hovered");
      tile.style.boxShadow = "";
      tile.style.filter = "";
      tile.style.transform = "";
      tile.style.zIndex = "";
      const title = tile.querySelector(".portfolio-tile__title");
      const tagline = tile.querySelector(".portfolio-tile__tagline");
      const img = tile.querySelector(".portfolio-tile__img");
      if (title) {
        title.style.letterSpacing = "";
        title.style.transform = "";
        title.style.backgroundPosition = "";
        title.style.textShadow = "";
      }
      if (tagline) {
        tagline.style.maxHeight = "";
        tagline.style.opacity = "";
        tagline.style.transform = "";
        tagline.style.color = "";
      }
      if (img) img.style.transform = "";
    });
  }

  _bindLayout() {
    this._updateColumns();
    if (typeof ResizeObserver !== "function") {
      window.addEventListener("resize", () => this._updateColumns());
      return;
    }
    this._ro = new ResizeObserver(() => this._updateColumns());
    this._ro.observe(this.track);
  }

  _updateColumns() {
    const width = this.track.clientWidth;
    if (!width) return;
    const styles = getComputedStyle(this.track);
    const gap = parseFloat(styles.gap) || 16;
    const minTile = Math.min(280, Math.max(160, width * 0.2));
    const maxCols = Math.max(1, Math.floor((width + gap) / (minTile + gap)));
    const count = Math.max(1, this.items.length);
    const cap = Math.min(maxCols, count);
    let cols = cap;
    for (let c = cap; c >= 1; c -= 1) {
      if (count % c === 0) {
        cols = c;
        break;
      }
    }
    this.track.style.setProperty("--portfolio-cols", String(cols));
  }

  _build() {
    this.track.innerHTML = "";
    this._tiles = [];

    this.items.forEach((data, i) => {
      const href = itemHref(data);
      const tile = document.createElement(href ? "a" : "article");
      tile.className = "portfolio-tile";
      tile.setAttribute("role", "listitem");
      tile.setAttribute("aria-label", data.title || `Portfolio item ${i + 1}`);
      if (href) {
        tile.href = href;
        tile.addEventListener("click", rememberPortfolioReturn);
        tile.addEventListener("auxclick", (event) => {
          if (event.button === 1) rememberPortfolioReturn();
        });
      }

      const media = document.createElement("div");
      media.className = "portfolio-tile__media";

      const img = document.createElement("img");
      img.className = "portfolio-tile__img";
      img.alt = data.title ? `${data.title} preview` : `Portfolio item ${i + 1}`;
      img.draggable = false;
      setTileImage(img, i, data);
      media.appendChild(img);

      const copy = document.createElement("div");
      copy.className = "portfolio-tile__copy";

      const title = document.createElement("h3");
      title.className = "portfolio-tile__title";
      title.textContent = data.title || `Project ${String(i + 1).padStart(2, "0")}`;

      const tagline = document.createElement("p");
      tagline.className = "portfolio-tile__tagline";
      tagline.textContent = data.tagline || "";

      copy.append(title, tagline);
      tile.append(media, copy);

      tile.addEventListener("pointerenter", () => {
        tile.classList.add("is-hovered");
      });
      tile.addEventListener("pointerleave", () => {
        tile.classList.remove("is-hovered");
      });

      this.track.appendChild(tile);
      this._tiles.push(tile);
    });
  }
}
