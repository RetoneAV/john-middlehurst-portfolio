/* ============================================================
   Client logo marquee
   ------------------------------------------------------------
   A single row of marks that travels right to left at a
   constant speed. No snapping, no pause, and no centre scale.
   Two identical sets are laid end to end so the loop is seamless.

   SnapScroll still calls the entrance/exit methods, so the row
   fades with the section without stopping the scroll.
   ============================================================ */
import { gsap } from "gsap";

const ALT = {
  adidas: "Adidas",
  spotify: "Spotify",
  pa: "Pixel Artworks",
  pa_logo: "Pixel Artworks",
  "brit-awards": "BRIT Awards",
  britawards: "BRIT Awards",
  guinness: "Guinness",
  belstaff: "Belstaff",
  outernet: "Outernet",
  bbh: "BBH",
  cdw: "Clerkenwell Design Week",
  londonmarathon: "London Marathon Events",
  aao: "American Academy of Ophthalmology",
  rsa: "RSA",
  modon: "Modon",
  "baby-teeth": "Baby Teeth",
  engageworks: "engageWorks",
  engage: "engageWorks",
  motionmapping: "Motion Mapping",
};

function altFor(image, title) {
  if (title && String(title).trim()) return String(title).trim();
  const file = String(image || "").split("/").pop() || "";
  const key = file.replace(/\.[^.]+$/, "").toLowerCase();
  return ALT[key] || "Client logo";
}

export class ClientMarquee {
  constructor(opts) {
    this.section = opts.section;
    this.root = this.section.querySelector("[data-client-marquee]");
    this.track = this.section.querySelector("[data-client-marquee-track]");
    this.items = (opts.items || []).slice();
    if (!this.track) throw new Error("Client marquee: missing track element");
    this._build();
  }

  update(items) {
    this.items = (items || []).slice();
    this._build();
  }

  _build() {
    this.track.replaceChildren();
    for (let copy = 0; copy < 2; copy += 1) {
      const set = document.createElement("div");
      set.className = "client-marquee__set";
      if (copy === 1) set.setAttribute("aria-hidden", "true");
      this.items.forEach((data) => {
        const item = document.createElement("div");
        item.className = "client-marquee__item";
        const img = document.createElement("img");
        img.className = "client-marquee__img";
        img.alt = copy === 0 ? altFor(data?.image, data?.title) : "";
        img.draggable = false;
        img.decoding = "async";
        if (data?.image) img.src = data.image;
        item.appendChild(img);
        set.appendChild(item);
      });
      this.track.appendChild(set);
    }
  }

  resetForEnter() {
    if (this.root) gsap.set(this.root, { autoAlpha: 0 });
  }

  showImmediate() {
    if (this.root) gsap.set(this.root, { autoAlpha: 1 });
  }

  enterTimeline() {
    const tl = gsap.timeline({ paused: true });
    if (this.root) tl.to(this.root, { autoAlpha: 1, duration: 0.6, ease: "power2.out" }, 0);
    return tl;
  }

  exitTimeline() {
    const tl = gsap.timeline({ paused: true });
    if (this.root) tl.to(this.root, { autoAlpha: 0, duration: 0.35, ease: "power2.in" }, 0);
    return tl;
  }
}
