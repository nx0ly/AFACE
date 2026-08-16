// YESSS!!! TYPESCRIPT BEAUTY!

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.subtitle
 * @returns {{ overlay: HTMLElement, panel: HTMLElement, status: HTMLElement, remove: () => void } | undefined}
 *   Undefined when an overlay is already mounted or the body isn't there yet.
 */
export function createPunishmentPanel({ title, subtitle }) {
  if (!document.body || document.querySelector(".page-pause-panel-overlay")) {
    return undefined;
  }

  const overlay = document.createElement("div");
  const panel = document.createElement("div");
  const heading = document.createElement("h2");
  const description = document.createElement("p");
  const status = document.createElement("p");

  overlay.className = "page-pause-panel-overlay";
  panel.className = "page-pause-panel";
  heading.className = "page-pause-panel-title";
  description.className = "page-pause-panel-subtitle";
  status.className = "page-pause-panel-status";
  heading.textContent = title;
  description.textContent = subtitle;
  status.setAttribute("aria-live", "polite");

  panel.append(heading, description, status);
  overlay.append(panel);
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", title);
  document.body.append(overlay);

  return {
    overlay,
    panel,
    status,
    remove: () => overlay.remove(),
  };
}

/**
 * @param {string} label
 * @returns {HTMLButtonElement}
 */
export function createPunishmentButton(label) {
  const button = document.createElement("button");

  button.className = "page-pause-panel-button";
  button.type = "button";
  button.textContent = label;
  return button;
}
