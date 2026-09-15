/* ============================================================
   Contact button — one fixed control, shared across every scene
   ============================================================ */

const CONTACT_EMAIL = "john.middlehurst@gmail.com";
const AUTO_COLLAPSE_MS = 6_000;
const COPIED_MS = 1_800;

let collapseTimer = null;
let copiedTimer = null;

function clearCollapseTimer() {
  if (collapseTimer != null) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
}

function clearCopiedTimer() {
  if (copiedTimer != null) {
    clearTimeout(copiedTimer);
    copiedTimer = null;
  }
}

function collapseContactButton(wrap) {
  clearCollapseTimer();
  clearCopiedTimer();
  wrap.classList.remove("is-expanded", "is-copied");
  const toggle = wrap.querySelector(".contact-btn__toggle");
  const copy = wrap.querySelector(".contact-btn__copy");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  if (copy) copy.setAttribute("aria-label", "Copy email address");
}

function scheduleCollapse(wrap) {
  clearCollapseTimer();
  collapseTimer = window.setTimeout(() => {
    collapseTimer = null;
    collapseContactButton(wrap);
  }, AUTO_COLLAPSE_MS);
}

function expandContactButton(wrap) {
  wrap.classList.add("is-expanded");
  const toggle = wrap.querySelector(".contact-btn__toggle");
  if (toggle) toggle.setAttribute("aria-expanded", "true");
  scheduleCollapse(wrap);
}

function markCopied(wrap) {
  const copy = wrap.querySelector(".contact-btn__copy");
  wrap.classList.add("is-copied");
  if (copy) copy.setAttribute("aria-label", "Email copied");
  clearCopiedTimer();
  copiedTimer = window.setTimeout(() => {
    copiedTimer = null;
    wrap.classList.remove("is-copied");
    if (copy) copy.setAttribute("aria-label", "Copy email address");
  }, COPIED_MS);
}

async function copyEmail(wrap) {
  try {
    await navigator.clipboard.writeText(CONTACT_EMAIL);
    markCopied(wrap);
    scheduleCollapse(wrap);
    return;
  } catch {
    // fall through to execCommand
  }

  try {
    const field = document.createElement("textarea");
    field.value = CONTACT_EMAIL;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    document.execCommand("copy");
    field.remove();
    markCopied(wrap);
    scheduleCollapse(wrap);
  } catch {
    wrap.classList.remove("is-copied");
  }
}

function createCopyIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("contact-btn__icon", "contact-btn__icon--copy");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M9 3.75A2.25 2.25 0 0 1 11.25 1.5h7.5A2.25 2.25 0 0 1 21 3.75v10.5A2.25 2.25 0 0 1 18.75 16.5h-1.5v1.75A2.25 2.25 0 0 1 15 20.5H5.25A2.25 2.25 0 0 1 3 18.25V7.5A2.25 2.25 0 0 1 5.25 5.25H7.5V3.75Zm2.25-.75a.75.75 0 0 0-.75.75V5.25h6A2.25 2.25 0 0 1 18.75 7.5v6.75h.75a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-7.5ZM4.5 7.5v10.75c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V7.5a.75.75 0 0 0-.75-.75H5.25a.75.75 0 0 0-.75.75Z"
  );
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

function createCheckIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("contact-btn__icon", "contact-btn__icon--check");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M20.285 6.708a1 1 0 0 1 0 1.414l-9.192 9.193a1 1 0 0 1-1.414 0L3.715 11.35a1 1 0 1 1 1.414-1.414l5.254 5.254 8.485-8.485a1 1 0 0 1 1.417.003Z"
  );
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

function createContactButton() {
  const wrap = document.createElement("div");
  wrap.className = "contact-btn";
  wrap.setAttribute("data-contact-btn", "");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "contact-btn__toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Contact — show email");
  toggle.textContent = "Contact";

  const mail = document.createElement("a");
  mail.className = "contact-btn__mail";
  mail.href = `mailto:${CONTACT_EMAIL}`;
  mail.textContent = CONTACT_EMAIL;
  mail.setAttribute("aria-label", `Email ${CONTACT_EMAIL}`);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "contact-btn__copy";
  copy.setAttribute("aria-label", "Copy email address");
  copy.append(createCopyIcon(), createCheckIcon());

  toggle.addEventListener("click", () => {
    if (wrap.classList.contains("is-expanded")) {
      collapseContactButton(wrap);
      return;
    }
    expandContactButton(wrap);
  });

  copy.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    copyEmail(wrap);
  });

  wrap.append(toggle, mail, copy);
  return wrap;
}

/** Mount the contact button in the header, opposite the brand. */
export function mountContactButtons() {
  document.querySelectorAll("[data-contact-btn]").forEach((el) => el.remove());
  const header = document.querySelector(".site-header");
  (header || document.body).appendChild(createContactButton());
}
