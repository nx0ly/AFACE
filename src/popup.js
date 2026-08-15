const WHITELIST_PREFIX = 'page-pause:whitelist:';
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
