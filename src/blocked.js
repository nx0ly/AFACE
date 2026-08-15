const TOKEN_BALANCE_KEY = 'page-pause:tokens';
const WHITELIST_PREFIX = 'page-pause:whitelist:';
const PUNISHMENT_PREFIX = 'page-pause:punishment:';
const WHITELIST_DURATION = 30 * 60 * 1000;
const EXAMPLE_COM_WHITELIST_DURATION = 60 * 1000;

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

const continueButton = document.querySelector('#continue');
const openGamesButton = document.querySelector('#open-games');
const openShopButton = document.querySelector('#open-shop');
const tokenCount = document.querySelector('#token-count');
const whitelistDescription = document.querySelector('#whitelist-description');
const wheelOverlay = document.querySelector('#wheel-overlay');
const chanceWheel = document.querySelector('#chance-wheel');
const wheelStatus = document.querySelector('#wheel-status');
const originalUrl = getOriginalUrl(window.location.search);
const whitelistDuration = originalUrl.hostname === 'example.com'
  ? EXAMPLE_COM_WHITELIST_DURATION
  : WHITELIST_DURATION;
const whitelistMinutes = whitelistDuration / 60_000;
let balance = 0;
let wheelIsRunning = false;
const FORCE_PUNISHMENT_FOR_TESTING = true;

function normalizeBalance(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function renderBalance() {
  if (whitelistDescription) {
    whitelistDescription.textContent = `Continue to this site for ${whitelistMinutes} ${whitelistMinutes === 1 ? 'minute' : 'minutes'}.`;
  }

  if (tokenCount) {
    tokenCount.textContent = String(balance);
  }

  if (continueButton) {
    continueButton.disabled = balance < 1;
    continueButton.textContent = balance < 1
      ? 'Earn 1 token to continue'
      : `Use 1 token · Continue for ${whitelistMinutes} ${whitelistMinutes === 1 ? 'minute' : 'minutes'}`;
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

openGamesButton?.addEventListener('click', () => {
  window.location.assign('games.html');
});

openShopButton?.addEventListener('click', () => {
  window.location.assign('minigames/shop.html');
});

function chooseSafeOutcome() {
  const randomValue = new Uint32Array(1);
  crypto.getRandomValues(randomValue);
  return randomValue[0] % 2 === 0;
}

async function openArepaPunishment(storage) {
  const punishmentKey = `${PUNISHMENT_PREFIX}${originalUrl.hostname}`;

  await storage.set({
    [punishmentKey]: {
      url: originalUrl.toString(),
      duration: whitelistDuration,
    },
  });

  window.location.assign(originalUrl.toString());
}

async function spinChanceWheel(storage, whitelistKey) {
  if (!wheelOverlay || !chanceWheel || !wheelStatus || wheelIsRunning) {
    return;
  }

  wheelIsRunning = true;
  // Keep this forced on while the arepa punishment is being tested.
  const isSafe = FORCE_PUNISHMENT_FOR_TESTING ? false : chooseSafeOutcome();
  const rotation = (5 * 360) + (isSafe ? 0 : 180);
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const spinDuration = prefersReducedMotion ? 100 : 2800;

  wheelStatus.textContent = 'Spinning…';
  wheelOverlay.hidden = false;
  const animation = chanceWheel.animate(
    [
      { transform: 'rotate(0deg)' },
      { transform: `rotate(${rotation}deg)` },
    ],
    {
      duration: spinDuration,
      easing: 'cubic-bezier(0.15, 0.7, 0.1, 1)',
      fill: 'forwards',
    },
  );

  await animation.finished;
  wheelStatus.textContent = isSafe
    ? `Safe — enjoy your ${whitelistMinutes} ${whitelistMinutes === 1 ? 'minute' : 'minutes'}.`
    : 'Punishment — loading the arepa attack on your page…';

  if (!isSafe) {
    window.setTimeout(
      () => void openArepaPunishment(storage),
      prefersReducedMotion ? 250 : 1100,
    );
    return;
  }

  await storage.set({
    [whitelistKey]: Date.now() + whitelistDuration,
  });

  window.setTimeout(() => {
    window.location.assign(originalUrl.toString());
  }, prefersReducedMotion ? 250 : 1100);
}

continueButton?.addEventListener('click', async () => {
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

  if (latestBalance < 1) {
    balance = latestBalance;
    renderBalance();
    return;
  }

  continueButton.disabled = true;
  balance = latestBalance - 1;
  await storage.set({ [TOKEN_BALANCE_KEY]: balance });
  renderBalance();
  await spinChanceWheel(storage, whitelistKey);
});

void loadBalance();
