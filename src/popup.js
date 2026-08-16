import { PUNISHMENTS, findPunishmentById } from "./punishments/registry.js";

// lowk too lazy to put in config files.
// ts works.
const WHITELIST_PREFIX = "page-pause:whitelist:";
const WHITELIST_DURATION = 30 * 60 * 1000;
const PUNISHMENT_PREFIX = "page-pause:punishment:";
const RIG_PREFIX = "page-pause:rig:";

const clearButton = document.querySelector("#clear-whitelist");
const status = document.querySelector("#status");
const clearPunishmentsButton = document.querySelector("#clear-punishments");
const punishmentStatus = document.querySelector("#punishment-status");

function getStorage() {
  return (
    globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local
  );
}

function getTabs() {
  return globalThis.browser?.tabs ?? globalThis.chrome?.tabs;
}

function getRuntime() {
  return globalThis.browser?.runtime ?? globalThis.chrome?.runtime;
}

function toSiteUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The site a tab stands for.
 *
 * @returns {URL | undefined} undefined for pages the blocker never touches
 * (new tab, files, other extension pages).
 */
function getTabSite(tabUrl) {
  if (!tabUrl) {
    return undefined;
  }

  const site = toSiteUrl(tabUrl);

  if (site) {
    return site;
  }

  let url;

  try {
    url = new URL(tabUrl);
  } catch {
    return undefined;
  }

  const blockedPage = getRuntime()?.getURL("pages/blocked.html");

  if (!blockedPage || `${url.origin}${url.pathname}` !== blockedPage) {
    return undefined;
  }

  return toSiteUrl(url.searchParams.get("url") ?? "");
}

async function getActiveTabSite() {
  const tabs = getTabs();

  if (!tabs) {
    return {};
  }

  try {
    // ._.
    const [tab] = await tabs.query({ active: true, currentWindow: true });

    return { tab, site: getTabSite(tab?.url) };
  } catch {
    return {};
  }
}

async function getActiveHostname() {
  const { site } = await getActiveTabSite();

  return site?.hostname;
}

clearButton?.addEventListener("click", async () => {
  const storage = getStorage();

  if (!storage || !status) {
    return;
  }

  clearButton.disabled = true;
  const saved = await storage.get(null);
  const whitelistKeys = Object.keys(saved).filter((key) =>
    key.startsWith(WHITELIST_PREFIX),
  );

  if (whitelistKeys.length > 0) {
    await storage.remove(whitelistKeys);
  }

  status.textContent =
    whitelistKeys.length > 0
      ? `Cleared ${whitelistKeys.length} whitelist ${whitelistKeys.length === 1 ? "entry" : "entries"}. Refresh the page.`
      : "No whitelist entries to clear.";
  clearButton.disabled = false;
});

clearPunishmentsButton?.addEventListener("click", async () => {
  const storage = getStorage();

  if (!storage || !punishmentStatus) {
    return;
  }

  clearPunishmentsButton.disabled = true;
  const hostname = await getActiveHostname();

  if (!hostname) {
    punishmentStatus.textContent = "No site here to clear punishments for.";
    clearPunishmentsButton.disabled = false;
    return;
  }

  const saved = await storage.get(null);
  const keys = Object.keys(saved).filter(
    (key) =>
      key.startsWith(`${PUNISHMENT_PREFIX}${hostname}`) ||
      key === `${RIG_PREFIX}${hostname}`,
  );

  if (keys.length > 0) {
    await storage.remove(keys);
  }

  punishmentStatus.textContent =
    keys.length > 0
      ? `Cleared the punishment waiting on ${hostname}.`
      : `No punishment waiting on ${hostname}.`;
  clearPunishmentsButton.disabled = false;
});

void (async () => {
  const hostname = await getActiveHostname();

  if (hostname && punishmentStatus) {
    punishmentStatus.textContent = `Cancel any punishment waiting on ${hostname}.`;
  }
})();

/* --- Rig the wheel ----------------------------------------------------- */
// shhh
const rigOutcome = document.querySelector("#rig-outcome");
const rigPick = document.querySelector("#rig-pick");
const rigSpinButton = document.querySelector("#rig-spin");
const rigRunButton = document.querySelector("#rig-run");
const rigStatus = document.querySelector("#rig-status");

const rigAnyOption = document.createElement("option");

rigAnyOption.value = "";
rigAnyOption.textContent = "Random (any punishment)";
rigPick?.append(rigAnyOption);

for (const punishment of PUNISHMENTS) {
  const option = document.createElement("option");

  option.value = punishment.id;
  option.textContent = punishment.label;
  rigPick?.append(option);
}

function syncRigPickEnabled() {
  if (!rigPick || !rigOutcome) return;
  const doom = rigOutcome.value === "doom";
  rigPick.disabled = !doom;
  rigAnyOption.disabled = doom;
  if (!doom) rigPick.value = "";
}

rigOutcome?.addEventListener("change", syncRigPickEnabled);
syncRigPickEnabled();

/**
 * @returns {{ outcome: 'safe' | 'doom' | 'random', punishment: string }}
 * `punishment: ''` means "no preference". The wheel draws one at random.
 */
function readRigConfig() {
  const outcome =
    rigOutcome?.value === "safe" || rigOutcome?.value === "doom"
      ? /** @type {'safe' | 'doom'} */ (rigOutcome.value)
      : "random";
  const punishment = rigOutcome?.value === "doom" ? (rigPick?.value ?? "") : "";
  return { outcome, punishment };
}

rigSpinButton?.addEventListener("click", async () => {
  const storage = getStorage();

  if (!storage || !rigStatus) {
    return;
  }

  rigSpinButton.disabled = true;
  const hostname = await getActiveHostname();

  if (!hostname) {
    rigStatus.textContent = "No site here to rig.";
    rigSpinButton.disabled = false;
    return;
  }

  const config = readRigConfig();

  try {
    await storage.set({ [`${RIG_PREFIX}${hostname}`]: config });
    rigStatus.textContent =
      config.outcome === "random"
        ? `Next spin on ${hostname} rides fair.`
        : `Next spin on ${hostname} rigged to ${config.outcome.toUpperCase()}${
            config.punishment ? ` · ${config.punishment}` : ""
          }.`;
    rigSpinButton.disabled = false;
  } catch {
    rigStatus.textContent = "Could not rig it. Try again.";
    rigSpinButton.disabled = false;
  }
});

rigRunButton?.addEventListener("click", async () => {
  const storage = getStorage();
  const tabs = getTabs();

  if (!storage || !tabs || !rigStatus || !rigPick) {
    return;
  }

  rigRunButton.disabled = true;
  const { tab, site } = await getActiveTabSite();

  if (!tab || !site) {
    rigStatus.textContent = "No site here to punish.";
    rigRunButton.disabled = false;
    return;
  }

  const hostname = site.hostname;

  const config = readRigConfig();

  // prob fix chance herre, 25% uhh
  const resolvedOutcome =
    config.outcome === "random"
      ? Math.random() < 0.25
        ? "safe"
        : "doom"
      : config.outcome;

  try {
    await storage.remove([
      `${WHITELIST_PREFIX}${hostname}`,
      `${RIG_PREFIX}${hostname}`,
    ]);

    if (resolvedOutcome === "safe") {
      await storage.set({
        [`${WHITELIST_PREFIX}${hostname}`]: Date.now() + WHITELIST_DURATION,
      });
      rigStatus.textContent = `Safe — ${hostname} unlocked for 30 min…`;
    } else {
      const rigged = config.punishment
        ? findPunishmentById(config.punishment)
        : undefined;
      const punishment =
        rigged ?? PUNISHMENTS[Math.floor(Math.random() * PUNISHMENTS.length)];

      await storage.set({
        [`${PUNISHMENT_PREFIX}${hostname}`]: {
          url: site.toString(),
          duration: WHITELIST_DURATION,
          punishment: punishment.id,
        },
      });
      rigStatus.textContent = `Doom - ${punishment.label} running on ${hostname}…`;
    }

    await tabs.update(tab.id, { url: site.toString() });
    window.close();
  } catch {
    rigStatus.textContent = "Could not start it. Try again.";
    rigRunButton.disabled = false;
  }
});
