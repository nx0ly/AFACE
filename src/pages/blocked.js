import { PUNISHMENTS } from '../punishments/registry.js';

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
const chanceWheelStage = document.querySelector('#chance-wheel-stage');
const punishmentWheel = document.querySelector('#punishment-wheel');
const punishmentWheelStage = document.querySelector('#punishment-wheel-stage');
const wheelCaption = document.querySelector('#wheel-caption');
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

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function randomIndex(length) {
  const randomValue = new Uint32Array(1);
  crypto.getRandomValues(randomValue);
  return randomValue[0] % length;
}

function chooseSafeOutcome() {
  return randomIndex(2) === 0;
}

function setStatus(caption, message) {
  if (wheelCaption) wheelCaption.textContent = caption;
  if (wheelStatus) wheelStatus.textContent = message;
}

/**
 * Spins a wheel so that `targetDegrees` — measured clockwise from the top —
 * ends up under the pointer, after five full turns for show.
 */
function spinWheel(wheel, targetDegrees) {
  const rotation = (5 * 360) - targetDegrees;

  return wheel.animate(
    [
      { transform: 'rotate(0deg)' },
      { transform: `rotate(${rotation}deg)` },
    ],
    {
      duration: prefersReducedMotion() ? 100 : 2800,
      easing: 'cubic-bezier(0.15, 0.7, 0.1, 1)',
      fill: 'forwards',
    },
  ).finished;
}

function pause(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, prefersReducedMotion() ? 250 : milliseconds);
  });
}

/**
 * Paints one wedge per registered punishment, so adding a punishment widens the
 * wheel on its own. Colors come from the registry, so these are inline styles
 * rather than utility classes.
 */
function buildPunishmentWheel() {
  if (!punishmentWheel) {
    return;
  }

  const wedgeAngle = 360 / PUNISHMENTS.length;
  const stops = PUNISHMENTS.map((punishment, index) => {
    const start = index * wedgeAngle;
    return `${punishment.color} ${start}deg ${start + wedgeAngle}deg`;
  });

  punishmentWheel.style.background = `conic-gradient(${stops.join(', ')})`;
  punishmentWheel.setAttribute(
    'aria-label',
    `A wheel of ${PUNISHMENTS.length} punishments: ${PUNISHMENTS.map((item) => item.label).join(', ')}`,
  );

  for (const [index, punishment] of PUNISHMENTS.entries()) {
    const spoke = document.createElement('span');
    const label = document.createElement('span');

    // The spoke rotates to the wedge's middle; the label rides at its outer end.
    spoke.className = 'absolute inset-0 flex items-start justify-center pt-[6%]';
    spoke.style.transform = `rotate(${index * wedgeAngle + wedgeAngle / 2}deg)`;
    label.className =
      'max-w-[42%] text-center text-[clamp(10px,1.6vw,13px)] leading-tight font-black uppercase';
    label.style.color = punishment.textColor;
    label.textContent = punishment.label;
    spoke.append(label);
    punishmentWheel.append(spoke);
  }
}

/**
 * Second wheel: which punishment. The chosen id is stored with the pending
 * punishment, and the content script mounts the matching one on the target page.
 */
async function spinPunishmentWheel(storage) {
  const wedgeAngle = 360 / PUNISHMENTS.length;
  const index = randomIndex(PUNISHMENTS.length);
  const punishment = PUNISHMENTS[index];
  // Land anywhere inside the wedge, just not right on a seam.
  const jitter = (Math.random() - 0.5) * (wedgeAngle * 0.7);

  chanceWheelStage?.setAttribute('hidden', '');
  punishmentWheelStage?.removeAttribute('hidden');
  setStatus('Which punishment?', 'Spinning the punishment wheel…');
  await pause(450);

  if (punishmentWheel) {
    await spinWheel(punishmentWheel, index * wedgeAngle + wedgeAngle / 2 + jitter);
  }

  setStatus(punishment.label, punishment.taunt);
  await pause(1400);

  await storage.set({
    [`${PUNISHMENT_PREFIX}${originalUrl.hostname}`]: {
      url: originalUrl.toString(),
      duration: whitelistDuration,
      punishment: punishment.id,
    },
  });

  window.location.assign(originalUrl.toString());
}

async function spinChanceWheel(storage, whitelistKey) {
  if (!wheelOverlay || !chanceWheel || !wheelStatus || wheelIsRunning) {
    return;
  }

  wheelIsRunning = true;
  // Keep this forced on while the punishments are being tested.
  const isSafe = FORCE_PUNISHMENT_FOR_TESTING ? false : chooseSafeOutcome();

  setStatus('Wheel of Doom', 'Deciding your fate…');
  wheelOverlay.hidden = false;
  document.body.classList.add('wheel-open');
  wheelOverlay.querySelector('.wheel-content')?.focus();
  // The wheel is painted from -90deg, so Safe covers the top half: 0deg lands on
  // Safe and 180deg lands on Punishment.
  await spinWheel(chanceWheel, isSafe ? 0 : 180);

  if (!isSafe) {
    setStatus('Doom', 'Punishment — now to decide which one.');
    await pause(900);
    await spinPunishmentWheel(storage);
    return;
  }

  setStatus(
    'Safe',
    `Safe — ${whitelistMinutes} ${whitelistMinutes === 1 ? 'minute' : 'minutes'} is yours.`,
  );

  await storage.set({
    [whitelistKey]: Date.now() + whitelistDuration,
  });

  await pause(1100);
  window.location.assign(originalUrl.toString());
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

buildPunishmentWheel();
void loadBalance();
