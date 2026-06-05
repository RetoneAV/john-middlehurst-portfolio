/* ============================================================
   Production site configuration snapshot (committed to git).
   Aggregates the baked-in defaults from each module so the
   live site and new visitors get the same tuned settings
   without relying on localStorage.
   ============================================================ */
import { DEFAULT_FLUID_PARAMS } from "../js/fluid.js";
import { DEFAULT_TUNNEL_PARAMS } from "../js/particles.js";
import {
  DEFAULT_LAYOUT_PARAMS,
  DEFAULT_TEXT_CONTENT,
  DEFAULT_PORTFOLIO_ITEMS,
  DEFAULT_CLIENT_ITEMS,
} from "../js/preferences.js";

export const SITE_DEFAULTS = {
  fluid: structuredClone(DEFAULT_FLUID_PARAMS),
  layout: { ...DEFAULT_LAYOUT_PARAMS },
  tunnel: { ...DEFAULT_TUNNEL_PARAMS },
  text: structuredClone(DEFAULT_TEXT_CONTENT),
  portfolio: DEFAULT_PORTFOLIO_ITEMS.map((item) => ({ ...item })),
  clients: DEFAULT_CLIENT_ITEMS.map((item) => ({ ...item })),
  snap: { wheelThreshold: 40 },
};
