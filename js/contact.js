/* ============================================================
   Contact button — one fixed control, shared across every scene
   ============================================================ */

const CONTACT_DOMAIN = "john.middlehurst.com";
const AUTO_COLLAPSE_MS = 20_000;

let collapseTimer = null;

function clearCollapseTimer() {
  if (collapseTimer != null) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
}

function collapseContactButton(btn) {
  clearCollapseTimer();
  btn.classList.remove("is-expanded");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-label", "Contact — show website");
  const text = btn.querySelector(".contact-btn__text");
  if (text) text.textContent = "Contact";
}

function expandContactButton(btn) {
  btn.classList.add("is-expanded");
  btn.setAttribute("aria-expanded", "true");
  btn.setAttribute("aria-label", CONTACT_DOMAIN);
  const text = btn.querySelector(".contact-btn__text");
  if (text) text.textContent = CONTACT_DOMAIN;
  clearCollapseTimer();
  collapseTimer = window.setTimeout(() => {
    collapseTimer = null;
    collapseContactButton(btn);
  }, AUTO_COLLAPSE_MS);
}

function createContactButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "contact-btn";
  btn.setAttribute("data-contact-btn", "");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-label", "Contact — show website");

  const text = document.createElement("span");
  text.className = "contact-btn__text";
  text.textContent = "Contact";
  btn.appendChild(text);

  btn.addEventListener("click", () => {
    if (btn.classList.contains("is-expanded")) {
      collapseContactButton(btn);
      return;
    }
    expandContactButton(btn);
  });

  return btn;
}

/** Mount the contact button in the header, opposite the brand. */
export function mountContactButtons() {
  document.querySelectorAll("[data-contact-btn]").forEach((el) => el.remove());
  const header = document.querySelector(".site-header");
  (header || document.body).appendChild(createContactButton());
}
