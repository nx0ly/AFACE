const TOKEN_BALANCE_KEY = 'page-pause:tokens';
const WHITELIST_PREFIX = 'page-pause:whitelist:';
const WHITELIST_DURATION = 30 * 60 * 1000;

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
const earnTokenButton = document.querySelector('#earn-token');
const tokenCount = document.querySelector('#token-count');
const originalUrl = getOriginalUrl(window.location.search);
let balance = 0;

function normalizeBalance(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function renderBalance() {
  if (tokenCount) {
    tokenCount.textContent = String(balance);
  }

  if (continueButton) {
    continueButton.disabled = balance < 1;
    continueButton.textContent = balance < 1
      ? 'Earn 1 token to continue'
      : 'Use 1 token · Continue for 30 minutes';
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

earnTokenButton?.addEventListener('click', async () => {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  earnTokenButton.disabled = true;
  const saved = await storage.get(TOKEN_BALANCE_KEY);
  balance = normalizeBalance(saved[TOKEN_BALANCE_KEY]) + 1;
  await storage.set({ [TOKEN_BALANCE_KEY]: balance });
  earnTokenButton.disabled = false;
  renderBalance();
});

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
  await storage.set({
    [TOKEN_BALANCE_KEY]: balance,
    [whitelistKey]: Date.now() + WHITELIST_DURATION,
  });
  window.location.assign(originalUrl.toString());
});

void loadBalance();
