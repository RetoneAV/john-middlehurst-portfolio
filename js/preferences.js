/* ============================================================
   Preferences persistence
   ------------------------------------------------------------
   Saves and restores the panels' tweakable parameters
   (fluid scene, snap-scroll, layout) to localStorage so the
   user's tweaks survive page reloads.

   Schema is bumped via the storage key suffix; older saves
   are silently ignored when the schema changes. localStorage
   itself is wrapped in try/catch to handle private-mode and
   storage-disabled environments gracefully.
   ============================================================ */
const STORAGE_KEY = "jm-portfolio-prefs:v1";

/** Full snapshot loaded from localStorage, or null if nothing/corrupt. */
export function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function savePreferences(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Failed to save preferences", err);
  }
}

export function clearPreferences() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/* ---------- Layout / page-level params (live-edited via Tweakpane) ---------- */

export const DEFAULT_LAYOUT_PARAMS = {
  textPadTopVh: 8,         // distance from viewport top to the top text group (vh)
  textPadBottomVh: 8,      // distance from viewport bottom to the bottom text group (vh)
  textMaxRem: 56,          // max-width of each section's text stage (rem)
  portfolioTextMaxRem: 56, // independent width cap for portfolio tagline / body
  titleFontScale: 1,       // multiplier on the display-title font-size clamp
  textStaggerScale: 1,     // multiplier on element-level stagger delays (intro + transitions)
  lineStagger: 0.12,       // seconds between successive title lines
  bgDim: 0,                // 0..1 darkening factor applied to background canvases
  bodyTextAlpha: 0.65,     // 0..1 alpha for the body-copy color (resting brightness)
};

/** Mutates the document root's CSS custom properties for layout/UI. */
export function applyLayoutParams(params) {
  const root = document.documentElement;
  if (typeof params.textPadTopVh === "number") {
    root.style.setProperty("--text-pad-top", `${params.textPadTopVh}vh`);
  }
  if (typeof params.textPadBottomVh === "number") {
    root.style.setProperty("--text-pad-bottom", `${params.textPadBottomVh}vh`);
  }
  if (typeof params.textMaxRem === "number") {
    root.style.setProperty("--text-max", `${params.textMaxRem}rem`);
  }
  if (typeof params.portfolioTextMaxRem === "number") {
    root.style.setProperty("--portfolio-text-max", `${params.portfolioTextMaxRem}rem`);
  }
  if (typeof params.titleFontScale === "number") {
    const v = Math.max(0.1, params.titleFontScale);
    root.style.setProperty("--title-font-scale", String(v));
  }
  if (typeof params.bgDim === "number") {
    const v = Math.max(0, Math.min(1, params.bgDim));
    root.style.setProperty("--bg-dim", String(v));
  }
  if (typeof params.bodyTextAlpha === "number") {
    const v = Math.max(0, Math.min(1, params.bodyTextAlpha));
    root.style.setProperty("--body-text-alpha", String(v));
  }
}

/* ---------- Text content (live-edited via Tweakpane) ---------- */

export const DEFAULT_TEXT_CONTENT = {
  hero: {
    eyebrow:    "Portfolio \u0026 Services",
    titleLine1: "John",
    titleLine2: "Middlehurst",
    tagline:    "Creative technologist and artist specialising in real-time interactive design and development",
    body:       "Immersive experiential design isn\u2019t just self-expression \u2014 it\u2019s connection. Through creative exploration and a passion for artistic development, I craft experiences that captivate and engage audiences, transforming your ideas into unforgettable moments that bring your vision to life.",
  },
  about: {
    eyebrow:    "01 / About",
    titleLine1: "About",
    titleLine2: "Me",
    tagline:    "",
    body:       "I am an interactive audiovisual artist and developer who creates immersive, engaging experiences using TouchDesigner and Unreal Engine. I specialise in utilising sensors and real-time inputs for interactive control of visuals, lighting, audio, lasers, and other complex systems. With a background in computer science, digital media, and music production, I blend technology and artistry to craft dynamic, captivating experiences that connect with audiences. I love problem solving and can work as part of a team or independently to take ideas from concept to delivery.",
  },
  portfolio: {
    eyebrow:    "02 / Portfolio",
    titleLine1: "Selected",
    titleLine2: "Work",
    tagline:    "A glimpse into recent projects spanning installations, performance, and experimental software.",
    body:       "From large-scale interactive installations to bespoke creative tools, the work below explores how movement, light, and sound can come together to invite an audience deeper into a story.",
  },
  clients: {
    eyebrow:    "03 / Clients",
    titleLine1: "Clients",
    titleLine2: "& Partners",
    tagline:    "Brands, agencies, and organisations I've collaborated with on immersive and interactive work.",
    body:       "From global campaigns to one-off installations, these partnerships span retail, culture, sport, and live events — each built around real-time technology and audience engagement.",
  },
};

const TEXT_SELECTORS = {
  hero: {
    eyebrow:    ".section--hero .eyebrow",
    titleLine1: ".section--hero .display-title .line:nth-child(1)",
    titleLine2: ".section--hero .display-title .line:nth-child(2)",
    tagline:    ".section--hero .tagline",
    body:       ".section--hero .body-copy",
  },
  about: {
    eyebrow:    ".section--about .eyebrow",
    titleLine1: ".section--about .display-title .line:nth-child(1)",
    titleLine2: ".section--about .display-title .line:nth-child(2)",
    tagline:    ".section--about .tagline",
    body:       ".section--about .body-copy",
  },
  portfolio: {
    eyebrow:    ".section--portfolio .eyebrow",
    titleLine1: ".section--portfolio .display-title .line:nth-child(1)",
    titleLine2: ".section--portfolio .display-title .line:nth-child(2)",
    tagline:    ".section--portfolio .tagline",
    body:       ".section--portfolio .body-copy",
  },
  clients: {
    eyebrow:    ".section--clients .eyebrow",
    titleLine1: ".section--clients .display-title .line:nth-child(1)",
    titleLine2: ".section--clients .display-title .line:nth-child(2)",
    tagline:    ".section--clients .tagline",
    body:       ".section--clients .body-copy",
  },
};

/** Returns a fresh deep-merged text-content object (saved values override defaults). */
export function mergeTextContent(saved) {
  return {
    hero:      { ...DEFAULT_TEXT_CONTENT.hero,      ...(saved && saved.hero      ? saved.hero      : {}) },
    about:     { ...DEFAULT_TEXT_CONTENT.about,     ...(saved && saved.about     ? saved.about     : {}) },
    portfolio: { ...DEFAULT_TEXT_CONTENT.portfolio, ...(saved && saved.portfolio ? saved.portfolio : {}) },
    clients:   { ...DEFAULT_TEXT_CONTENT.clients,   ...(saved && saved.clients   ? saved.clients   : {}) },
  };
}

/** Writes the supplied text values into the matching DOM elements. */
export function applyTextContent(content) {
  for (const sceneKey of Object.keys(TEXT_SELECTORS)) {
    const selectors = TEXT_SELECTORS[sceneKey];
    const values = content[sceneKey] || {};
    for (const fieldKey of Object.keys(selectors)) {
      if (!Object.prototype.hasOwnProperty.call(values, fieldKey)) continue;
      const el = document.querySelector(selectors[fieldKey]);
      if (el) el.textContent = values[fieldKey];
    }
  }
}

/* ---------- Portfolio items (per-card title + tagline) ---------- */

export const PORTFOLIO_ITEM_COUNT = 12;

const PORTFOLIO_TITLES = [
  "Volumetric Point Cloud",
  "Immersive LED Environment",
  "Yeast Cell Experience",
  "Belstaff Projection",
  "Generative Tree Tunnel",
  "Trade Show Display",
  "Audio-Reactive Light Wall",
  "Interactive Table Projection",
  "Gesture-Controlled Particles",
  "Adizero Immersive Run",
  "Kaleidoscope Installation",
  "Living Grid",
];

const PORTFOLIO_TAGLINES = [
  "Real-time depth capture and 3D reconstruction",
  "Floor-to-ceiling digital rain installation",
  "Interactive museum experience",
  "Large-scale building portrait mapping",
  "Particle-driven digital forest",
  "Interactive exhibition booth content",
  "Concert visual design and laser performance",
  "Touch-responsive dining experience",
  "Sensor-driven real-time visualisation",
  "Interactive treadmill experience",
  "Multi-screen narrative environment",
  "Generative nature projection mapping",
];

/** Relative paths under assets/portfolio/ */
const PORTFOLIO_IMAGE_FILES = [
  "01-guinness.jpeg",
  "02-cdw.png",
  "03-adizero.png",
  "04-outernet.jpeg",
  "05-dining.png",
  "06-swarm.jpg",
  "07-3droom.jpg",
  "08-belstaff.png",
  "09-photobooth.png",
  "10-realtimeAI.png",
  "11-360projection.png",
  "12-gestureControl.png",
];

export const DEFAULT_PORTFOLIO_ITEMS = Array.from(
  { length: PORTFOLIO_ITEM_COUNT },
  (_, i) => ({
    title: PORTFOLIO_TITLES[i] || `Project ${String(i + 1).padStart(2, "0")}`,
    tagline: PORTFOLIO_TAGLINES[i] || "Portfolio piece",
    image: `assets/portfolio/${PORTFOLIO_IMAGE_FILES[i] || `${String(i + 1).padStart(2, "0")}.jpg`}`,
  })
);

/** Returns a fresh portfolio-items array (saved values override defaults). */
export function mergePortfolioItems(saved) {
  const out = DEFAULT_PORTFOLIO_ITEMS.map((d, i) => ({ ...d }));
  if (Array.isArray(saved)) {
    saved.forEach((s, i) => {
      if (i >= out.length) return;
      if (s && typeof s === "object") {
        if (typeof s.title === "string") out[i].title = s.title;
        if (typeof s.tagline === "string") out[i].tagline = s.tagline;
        if (typeof s.image === "string") out[i].image = s.image;
      }
    });
  }
  return out;
}

/* ---------- Client items (per-card title + tagline + image) ---------- */

export const CLIENT_ITEM_COUNT = 17;

const CLIENT_TITLES = Array.from(
  { length: CLIENT_ITEM_COUNT },
  (_, i) => `Client ${String(i + 1).padStart(2, "0")}`
);

const CLIENT_TAGLINES = [
  "Brand activation",
  "Retail experience",
  "Live event",
  "Product launch",
  "Exhibition",
  "Festival installation",
  "Corporate event",
  "Sports activation",
  "Cultural institution",
  "Agency collaboration",
  "Global campaign",
  "Immersive showcase",
  "Brand partnership",
  "Retail activation",
  "Event production",
  "Creative collaboration",
  "Long-term partnership",
];

const CLIENT_IMAGE_FILES = Array.from(
  { length: CLIENT_ITEM_COUNT },
  (_, i) => `client-${String(i + 1).padStart(2, "0")}.png`
);

export const DEFAULT_CLIENT_ITEMS = Array.from(
  { length: CLIENT_ITEM_COUNT },
  (_, i) => ({
    title: CLIENT_TITLES[i] || `Client ${String(i + 1).padStart(2, "0")}`,
    tagline: CLIENT_TAGLINES[i] || "Collaboration",
    image: `assets/clients/${CLIENT_IMAGE_FILES[i]}`,
  })
);

/** Returns a fresh client-items array (saved values override defaults). */
export function mergeClientItems(saved) {
  const out = DEFAULT_CLIENT_ITEMS.map((d, i) => ({ ...d }));
  if (Array.isArray(saved)) {
    saved.forEach((s, i) => {
      if (i >= out.length) return;
      if (s && typeof s === "object") {
        if (typeof s.title === "string") out[i].title = s.title;
        if (typeof s.tagline === "string") out[i].tagline = s.tagline;
        if (typeof s.image === "string") out[i].image = s.image;
      }
    });
  }
  return out;
}
