import { PUNISHMENTS } from '../punishments/registry.js';

const TOKEN_BALANCE_KEY = 'page-pause:tokens';
const WHITELIST_PREFIX = 'page-pause:whitelist:';
const PUNISHMENT_PREFIX = 'page-pause:punishment:';
const RIG_PREFIX = 'page-pause:rig:';
const WHITELIST_DURATION = 30 * 60 * 1000;
const COST = 50;

function getStorage() {
  return globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
}

function getOriginalUrl(search) {
  const fallback = new URL('about:blank');
  const encodedUrl = new URLSearchParams(search).get('url');

  if (!encodedUrl) {
    return fallback;
  }

  try {
    const originalUrl = new URL(encodedUrl);
    return originalUrl.protocol === 'http:' || originalUrl.protocol === 'https:'
      ? originalUrl
      : fallback;
  } catch {
    return fallback;
  }
}

const useBeanButton = document.querySelector('#use-bean-button');
const tokenCount = document.querySelector('#token-count');
const randomizerOverlay = document.querySelector('#randomizer-overlay');
const randomizerText = document.querySelector('#randomizer-text');

const originalUrl = getOriginalUrl(window.location.search);
let balance = 0;
let isSpinning = false;

function normalizeBalance(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : 0;
}

function renderBalance() {
  if (tokenCount) {
    tokenCount.textContent = String(balance);
  }

  if (useBeanButton) {
    useBeanButton.disabled = balance < COST;
    if (balance < COST) {
        useBeanButton.textContent = `Buy Arepa (Need ${COST} Beans)`;
    } else {
        useBeanButton.textContent = `Buy Arepa (${COST} Beans) & Spin!`;
    }
  }
}

async function loadBalance() {
  const storage = getStorage();
  if (!storage) {
    renderBalance();
    return;
  }
  const saved = await storage.get(TOKEN_BALANCE_KEY);
  balance = normalizeBalance(saved[TOKEN_BALANCE_KEY]);
  renderBalance();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startRandomizer(storage, whitelistKey) {
    randomizerOverlay.classList.remove('hidden');
    
    // Flash random strings
    const flashWords = ["SAFE!", "DOOM!", "AREPAS!", "MANGO!", "QUEUE!", "PUNISHMENT!"];
    let flashes = 0;
    
    const interval = setInterval(() => {
        randomizerText.textContent = flashWords[Math.floor(Math.random() * flashWords.length)];
    }, 100);

    await pause(3000);
    clearInterval(interval);
    
    randomizerText.classList.remove('blink');

    // The popup can rig the next spin: 'safe' forces Safe, 'doom' forces a
    // punishment (optionally a specific one), 'random' leaves the wheel alone.
    // It is one-shot, so it is deleted here and never re-rigs a later spin.
    const rigKey = `${RIG_PREFIX}${originalUrl.hostname}`;
    let riggedOutcome;
    let riggedPunishmentId;
    try {
        const saved = await storage.get(rigKey);
        const rig = saved[rigKey];
        if (rig && typeof rig === 'object') {
            riggedOutcome = typeof rig.outcome === 'string' ? rig.outcome : undefined;
            riggedPunishmentId = typeof rig.punishment === 'string' ? rig.punishment : '';
        }
        await storage.remove(rigKey);
    } catch {
        // Storage unavailable — fall back to a fair roll.
    }

    // 25% safe by default, unless the rig forces a side.
    const isSafe = riggedOutcome === 'safe'
        ? true
        : riggedOutcome === 'doom'
            ? false
            : Math.random() < 0.25;

    if (isSafe) {
        randomizerText.textContent = "SAFE!!!";
        randomizerText.style.color = "lime";
        await pause(1500);
        await storage.set({
            [whitelistKey]: Date.now() + WHITELIST_DURATION,
        });
        window.location.assign(originalUrl.toString());
    } else {
        // A rigged id wins if it names a real punishment; otherwise fair draw.
        const rigged = riggedPunishmentId
            ? PUNISHMENTS.find((p) => p.id === riggedPunishmentId)
            : undefined;
        const punishment = rigged ?? PUNISHMENTS[Math.floor(Math.random() * PUNISHMENTS.length)];
        randomizerText.textContent = `PUNISHMENT: ${punishment.label.toUpperCase()}`;
        randomizerText.style.color = "red";
        await pause(2000);
        await storage.set({
            [`${PUNISHMENT_PREFIX}${originalUrl.hostname}`]: {
                url: originalUrl.toString(),
                duration: WHITELIST_DURATION,
                punishment: punishment.id,
            },
        });
        window.location.assign(originalUrl.toString());
    }
}

useBeanButton?.addEventListener('click', async () => {
  if (isSpinning) return;
  const storage = getStorage();

  if (!storage || originalUrl.protocol === 'about:') {
    return;
  }

  const whitelistKey = `${WHITELIST_PREFIX}${originalUrl.hostname}`;
  const saved = await storage.get([TOKEN_BALANCE_KEY, whitelistKey]);
  const latestBalance = normalizeBalance(saved[TOKEN_BALANCE_KEY]);

  if (
    typeof saved[whitelistKey] === 'number' &&
    saved[whitelistKey] > Date.now()
  ) {
    window.location.assign(originalUrl.toString());
    return;
  }

  if (latestBalance < COST) {
    balance = latestBalance;
    renderBalance();
    return;
  }

  isSpinning = true;
  useBeanButton.disabled = true;
  balance = latestBalance - COST;
  await storage.set({ [TOKEN_BALANCE_KEY]: balance });
  renderBalance();
  
  await startRandomizer(storage, whitelistKey);
});

loadBalance();
