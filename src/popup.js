import { PUNISHMENTS } from './punishments/registry.js';

const WHITELIST_PREFIX = 'page-pause:whitelist:';
// Matches blocked.js, so a rigged punishment grants the same pass as a real one.
const WHITELIST_DURATION = 30 * 60 * 1000;
const PUNISHMENT_PREFIX = 'page-pause:punishment:';

const clearButton = document.querySelector('#clear-whitelist');
const status = document.querySelector('#status');
const clearPunishmentsButton = document.querySelector('#clear-punishments');
const punishmentStatus = document.querySelector('#punishment-status');

function getStorage() {
  return globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
}

function getTabs() {
  return globalThis.browser?.tabs ?? globalThis.chrome?.tabs;
}

/**
 * Hostname of the tab the popup was opened over, or undefined for pages the
 * blocker never touches (new tab, extension pages, files).
 */
async function getActiveHostname() {
  const tabs = getTabs();

  if (!tabs) {
    return undefined;
  }

  try {
    const [tab] = await tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ? new URL(tab.url) : undefined;

    return url && (url.protocol === 'http:' || url.protocol === 'https:')
      ? url.hostname
      : undefined;
  } catch {
    return undefined;
  }
}

clearButton?.addEventListener('click', async () => {
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

  status.textContent = whitelistKeys.length > 0
    ? `Cleared ${whitelistKeys.length} whitelist ${whitelistKeys.length === 1 ? 'entry' : 'entries'}. Refresh the page.`
    : 'No whitelist entries to clear.';
  clearButton.disabled = false;
});

clearPunishmentsButton?.addEventListener('click', async () => {
  const storage = getStorage();

  if (!storage || !punishmentStatus) {
    return;
  }

  clearPunishmentsButton.disabled = true;
  const hostname = await getActiveHostname();

  if (!hostname) {
    punishmentStatus.textContent = 'No site here to clear punishments for.';
    clearPunishmentsButton.disabled = false;
    return;
  }

  // One pending punishment per hostname today, but sweep by prefix so this
  // keeps working if that ever becomes a list.
  const saved = await storage.get(null);
  const keys = Object.keys(saved).filter((key) =>
    key.startsWith(`${PUNISHMENT_PREFIX}${hostname}`),
  );

  if (keys.length > 0) {
    await storage.remove(keys);
  }

  punishmentStatus.textContent = keys.length > 0
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

/* --- Rig a punishment -------------------------------------------------- */

const rigPick = document.querySelector('#rig-pick');
const rigRunButton = document.querySelector('#rig-run');
const rigStatus = document.querySelector('#rig-status');

for (const punishment of PUNISHMENTS) {
  const option = document.createElement('option');

  option.value = punishment.id;
  option.textContent = punishment.label;
  rigPick?.append(option);
}

rigRunButton?.addEventListener('click', async () => {
  const storage = getStorage();
  const tabs = getTabs();

  if (!storage || !tabs || !rigStatus || !rigPick) {
    return;
  }

  rigRunButton.disabled = true;
  const hostname = await getActiveHostname();

  if (!hostname) {
    rigStatus.textContent = 'No site here to punish.';
    rigRunButton.disabled = false;
    return;
  }

  try {
    const [tab] = await tabs.query({ active: true, currentWindow: true });

    // Same payload shape the Doom wheel writes — see pages/blocked.js.
    await storage.set({
      [`${PUNISHMENT_PREFIX}${hostname}`]: {
        url: tab.url,
        duration: WHITELIST_DURATION,
        punishment: rigPick.value,
      },
    });

    // The punishment is served by the content script at document_start, so the
    // tab has to load again for it to pick this up.
    await storage.remove(`${WHITELIST_PREFIX}${hostname}`);
    await tabs.reload(tab.id);
    rigStatus.textContent = `Running it on ${hostname}…`;
    window.close();
  } catch {
    rigStatus.textContent = 'Could not start it. Try again.';
    rigRunButton.disabled = false;
  }
});
