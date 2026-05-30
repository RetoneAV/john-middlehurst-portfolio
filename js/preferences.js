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
  textPadTopVh: 14,
  textPadBottomVh: 31.5,
  textMaxRem: 25,
  portfolioTextMaxRem: 56,
  titleFontScale: 1,
  textStaggerScale: 1,
  lineStagger: 0.12,
  bgDim: 0.4,
  bodyTextAlpha: 0.64,
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
    eyebrow:    "JM Studios",
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
  "Guinness Storehouse",
  "Feel The Pull",
  "Adidas London Marathon",
  "Outernet London",
  "Immersive Dining",
  "Control The Swarm",
  "Holodeck 3D Room",
  "Belstaff",
  "Interactive Photobooth",
  "Real-Time Interactive AI Video",
  "360 Projections",
  "Gesture Control",
];

const PORTFOLIO_TAGLINES = [
  "Interactive Floor Experience",
  "Interactive Art Installation",
  "Interactive Brand Activation",
  "Data Visualisation",
  "",
  "Interactive Exhibition",
  "Interactive Art installation",
  "Projection Mapping",
  "Trade Show Experience",
  "",
  "Immersive Experience",
  "Real-Time Facial Analysis",
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
        if (typeof s.image === "string") out[i].image = s.image.replace(/\\/g, "/");
      }
    });
  }
  return out;
}

/* ---------- Client items (per-card title + tagline + image) ---------- */

export const CLIENT_ITEM_COUNT = 17;

/** Client logos in carousel order (titles/taglines intentionally blank). */
export const DEFAULT_CLIENT_ITEMS = [
  { title: "", tagline: "", image: "assets/clients/Adidas_55df4.jpg" },
  { title: "", tagline: "", image: "assets/clients/Spotify_ef334.png" },
  { title: "", tagline: "", image: "assets/clients/PA_7b36e.jpg" },
  { title: "", tagline: "", image: "assets/clients/Brit_Awards_1137a.jpeg" },
  { title: "", tagline: "", image: "assets/clients/Guinness_2c485.jpg" },
  { title: "", tagline: "", image: "assets/clients/Belstaff_5cea6.jpg" },
  { title: "", tagline: "", image: "assets/clients/Outernet_354e4.png" },
  { title: "", tagline: "", image: "assets/clients/PA_7b36e.jpg" },
  { title: "", tagline: "", image: "assets/clients/BBH_London_318ba.jpeg" },
  { title: "", tagline: "", image: "assets/clients/cdw_sq_936fe.webp" },
  { title: "", tagline: "", image: "assets/clients/AAO_6d051.jpg" },
  { title: "", tagline: "", image: "assets/clients/Genentech-Logo.wine_afc41.png" },
  { title: "", tagline: "", image: "assets/clients/rsa.jpg" },
  { title: "", tagline: "", image: "assets/clients/modon.webp" },
  { title: "", tagline: "", image: "assets/clients/baby_teeth_logo.jpg" },
  { title: "", tagline: "", image: "assets/clients/engageWorks.jpg" },
  { title: "", tagline: "", image: "assets/clients/MotionMapping.jpg" },
];

/** Returns a fresh client-items array (saved values override defaults). */
export function mergeClientItems(saved) {
  const out = DEFAULT_CLIENT_ITEMS.map((d, i) => ({ ...d }));
  if (Array.isArray(saved)) {
    saved.forEach((s, i) => {
      if (i >= out.length) return;
      if (s && typeof s === "object") {
        if (typeof s.title === "string") out[i].title = s.title;
        if (typeof s.tagline === "string") out[i].tagline = s.tagline;
        if (typeof s.image === "string") out[i].image = s.image.replace(/\\/g, "/");
      }
    });
  }
  return out;
}
