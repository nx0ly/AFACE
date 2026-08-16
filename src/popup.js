import { PUNISHMENTS } from './punishments/registry.js';

const WHITELIST_PREFIX = 'page-pause:whitelist:';
// Matches blocked.js, so a rigged punishment grants the same pass as a real one.
const WHITELIST_DURATION = 30 * 60 * 1000;
const PUNISHMENT_PREFIX = 'page-pause:punishment:';
const RIG_PREFIX = 'page-pause:rig:';

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
  // keeps working if that ever becomes a list. Also clears a rigged next spin
  // on this hostname so "clear" really resets the slate.
  const saved = await storage.get(null);
  const keys = Object.keys(saved).filter(
    (key) =>
      key.startsWith(`${PUNISHMENT_PREFIX}${hostname}`) ||
      key === `${RIG_PREFIX}${hostname}`,
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

/* --- Rig the wheel ----------------------------------------------------- */

const rigOutcome = document.querySelector('#rig-outcome');
const rigPick = document.querySelector('#rig-pick');
const rigSpinButton = document.querySelector('#rig-spin');
const rigRunButton = document.querySelector('#rig-run');
const rigStatus = document.querySelector('#rig-status');

// A "Random (any)" option leads the picker; it writes an empty punishment id,
// which the wheel reads as "let it ride on which punishment".
const rigAnyOption = document.createElement('option');

rigAnyOption.value = '';
rigAnyOption.textContent = 'Random (any punishment)';
rigPick?.append(rigAnyOption);

for (const punishment of PUNISHMENTS) {
  const option = document.createElement('option');

  option.value = punishment.id;
  option.textContent = punishment.label;
  rigPick?.append(option);
}

// The punishment chooser only matters under Doom, so dim it otherwise.
function syncRigPickEnabled() {
  if (!rigPick || !rigOutcome) return;
  const doom = rigOutcome.value === 'doom';
  rigPick.disabled = !doom;
  // Disable the "Random (any punishment)" entry once a side is picked, so a
  // Doom rig points at a concrete punishment and the option reads as a placeholder.
  rigAnyOption.disabled = doom;
  if (!doom) rigPick.value = '';
}

rigOutcome?.addEventListener('change', syncRigPickEnabled);
syncRigPickEnabled();

/**
 * @returns {{ outcome: 'safe' | 'doom' | 'random', punishment: string }}
 * `punishment: ''` means "no preference" — the wheel draws one at random.
 */
function readRigConfig() {
  const outcome = rigOutcome?.value === 'safe' || rigOutcome?.value === 'doom'
    ? /** @type {'safe' | 'doom'} */ (rigOutcome.value)
    : 'random';
  const punishment = rigOutcome?.value === 'doom' ? (rigPick?.value ?? '') : '';
  return { outcome, punishment };
}

// "Rig next spin": stage a one-shot rig that the real wheel reads and consumes
// on the user's next paid spin. Nothing reloads — they go spin to see it land.
rigSpinButton?.addEventListener('click', async () => {
  const storage = getStorage();

  if (!storage || !rigStatus) {
    return;
  }

  rigSpinButton.disabled = true;
  const hostname = await getActiveHostname();

  if (!hostname) {
    rigStatus.textContent = 'No site here to rig.';
    rigSpinButton.disabled = false;
    return;
  }

  const config = readRigConfig();

  try {
    await storage.set({ [`${RIG_PREFIX}${hostname}`]: config });
    rigStatus.textContent =
      config.outcome === 'random'
        ? `Next spin on ${hostname} rides fair.`
        : `Next spin on ${hostname} rigged to ${config.outcome.toUpperCase()}${
            config.punishment ? ` · ${config.punishment}` : ''
          }.`;
    rigSpinButton.disabled = false;
  } catch {
    rigStatus.textContent = 'Could not rig it. Try again.';
    rigSpinButton.disabled = false;
  }
});

// "Run it here now": apply the chosen outcome to the current tab immediately,
// the old rig's behaviour, but now with a Safe branch and a fair fallback.
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

  const config = readRigConfig();

  // "Random" has no rig preference, so roll the actual odds here instead of
  // farming it out to the wheel — the run button should always do something.
  const resolvedOutcome =
    config.outcome === 'random'
      ? (Math.random() < 0.25 ? 'safe' : 'doom')
      : config.outcome;

  try {
    const [tab] = await tabs.query({ active: true, currentWindow: true });

    // Carry nothing over: a rigged run wipes a pending punishment, a pending
    // rig, and any live whitelist so it can take effect cleanly.
    await storage.remove([
      `${WHITELIST_PREFIX}${hostname}`,
      `${RIG_PREFIX}${hostname}`,
    ]);

    if (resolvedOutcome === 'safe') {
      // Same pass the Safe wedge of the wheel grants.
      await storage.set({
        [`${WHITELIST_PREFIX}${hostname}`]: Date.now() + WHITELIST_DURATION,
      });
      rigStatus.textContent = `Safe — ${hostname} unlocked for 30 min…`;
    } else {
      // Doom: the chosen punishment, or a fair draw if none was picked. Falls
      // back to any real punishment id, never an empty string.
      const rigged = config.punishment
        ? PUNISHMENTS.find((p) => p.id === config.punishment)
        : undefined;
      const punishment = rigged ?? PUNISHMENTS[Math.floor(Math.random() * PUNISHMENTS.length)];

      // Same payload shape the Doom wheel writes — see pages/blocked.js.
      await storage.set({
        [`${PUNISHMENT_PREFIX}${hostname}`]: {
          url: tab.url,
          duration: WHITELIST_DURATION,
          punishment: punishment.id,
        },
      });
      rigStatus.textContent = `Doom · ${punishment.label} running on ${hostname}…`;
    }

    // The punishment is served by the content script at document_start, so the
    // tab has to load again for it to pick this up.
    await tabs.reload(tab.id);
    window.close();
  } catch {
    rigStatus.textContent = 'Could not start it. Try again.';
    rigRunButton.disabled = false;
  }
});
