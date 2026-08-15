export {};

const WHITELIST_PREFIX = 'page-pause:whitelist:';
const PUNISHMENT_PREFIX = 'page-pause:punishment:';
const AREPA_COUNT = 120;

type ExtensionApi = typeof browser;

type PendingPunishment = {
  url: string;
  duration: number;
};

function getExtensionApi(): ExtensionApi | undefined {
  const extensionGlobal = globalThis as typeof globalThis & {
    browser?: ExtensionApi;
    chrome?: ExtensionApi;
  };

  return extensionGlobal.browser ?? extensionGlobal.chrome;
}

function getWhitelistKey(hostname: string): string {
  return `${WHITELIST_PREFIX}${hostname}`;
}

function getPunishmentKey(hostname: string): string {
  return `${PUNISHMENT_PREFIX}${hostname}`;
}

async function isHostnameWhitelisted(hostname: string): Promise<boolean> {
  const storage = getExtensionApi()?.storage?.local;

  if (!storage) {
    return false;
  }

  const key = getWhitelistKey(hostname);
  try {
    const saved = await storage.get(key);
    const expiresAt = saved[key];

    if (typeof expiresAt !== 'number') {
      return false;
    }

    if (expiresAt > Date.now()) {
      return true;
    }

    await storage.remove(key);
    return false;
  } catch {
    // If storage is unavailable, keep the blocker active.
    return false;
  }
}

async function getPendingPunishment(hostname: string): Promise<PendingPunishment | undefined> {
  const storage = getExtensionApi()?.storage?.local;

  if (!storage) {
    return undefined;
  }

  try {
    const saved = await storage.get(getPunishmentKey(hostname));
    const candidate = saved[getPunishmentKey(hostname)];

    if (!candidate || typeof candidate !== 'object') {
      return undefined;
    }

    const pending = candidate as { url?: unknown; duration?: unknown };
    const targetUrl = typeof pending.url === 'string' ? new URL(pending.url) : undefined;

    if (
      !targetUrl ||
      (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') ||
      targetUrl.hostname !== hostname ||
      typeof pending.duration !== 'number' ||
      !Number.isFinite(pending.duration) ||
      pending.duration <= 0
    ) {
      return undefined;
    }

    return {
      url: targetUrl.toString(),
      duration: pending.duration,
    };
  } catch {
    return undefined;
  }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

type ArepaState = {
  element: HTMLButtonElement;
  x: number;
  y: number;
  size: number;
  velocityX: number;
  velocityY: number;
  active: boolean;
};

function explodeArepa(stage: HTMLElement, x: number, y: number): void {
  const colors = ['#f6d37a', '#d8943e', '#a9652b', '#fff0b5'];

  for (let index = 0; index < 10; index += 1) {
    const particle = document.createElement('span');
    const angle = (index / 10) * Math.PI * 2;
    const distance = randomBetween(28, 92);

    particle.className = 'page-pause-arepa-particle';
    particle.style.left = `${x - 5}px`;
    particle.style.top = `${y - 5}px`;
    particle.style.setProperty('--particle-x', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--particle-y', `${Math.sin(angle) * distance}px`);
    particle.style.setProperty('--particle-color', colors[index % colors.length]);
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
    stage.append(particle);
  }
}

async function mountArepaPunishment(
  pending: PendingPunishment,
  punishmentKey: string,
): Promise<void> {
  const extensionApi = getExtensionApi();
  const storage = extensionApi?.storage?.local;

  if (!storage || !document.body || document.querySelector('.page-pause-arepa-overlay')) {
    return;
  }

  const overlay = document.createElement('div');
  const stage = document.createElement('div');
  const status = document.createElement('span');
  let remaining = AREPA_COUNT;
  let animationFrame = 0;
  let lastFrame = performance.now();
  let running = true;
  const arepas: ArepaState[] = [];
  const arepaImageUrl = extensionApi.runtime.getURL('images/arepa.png');

  overlay.className = 'page-pause-arepa-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  stage.className = 'page-pause-arepa-stage';
  status.className = 'page-pause-arepa-status';
  status.setAttribute('aria-live', 'polite');
  status.textContent = `${remaining} arepas left · click to explode`;
  overlay.append(stage, status);
  document.body.append(overlay);

  const finish = async (): Promise<void> => {
    running = false;
    window.cancelAnimationFrame(animationFrame);
    status.textContent = 'All exploded · returning to your page…';

    try {
      await storage.set({
        [getWhitelistKey(new URL(pending.url).hostname)]: Date.now() + pending.duration,
      });
      await storage.remove(punishmentKey);
      window.location.replace(pending.url);
    } catch {
      status.textContent = 'Almost there — could not save your pass. Try again.';
      running = true;
      animationFrame = window.requestAnimationFrame(animate);
    }
  };

  const handleClick = (arepa: ArepaState): void => {
    if (!arepa.active) return;

    arepa.active = false;
    const centerX = arepa.x + arepa.size / 2;
    const centerY = arepa.y + arepa.size / 2;
    arepa.element.remove();
    explodeArepa(stage, centerX, centerY);
    remaining -= 1;
    status.textContent = remaining === 0
      ? 'All exploded · returning to your page…'
      : `${remaining} arepa${remaining === 1 ? '' : 's'} left · click to explode`;

    if (remaining === 0) {
      void finish();
    }
  };

  for (let index = 0; index < AREPA_COUNT; index += 1) {
    const arepa = document.createElement('button');
    const size = randomBetween(96, 180);
    const state: ArepaState = {
      element: arepa,
      x: randomBetween(0, Math.max(0, window.innerWidth - size)),
      y: randomBetween(-window.innerHeight * 0.25, window.innerHeight * 0.78),
      size,
      velocityX: randomBetween(-1.3, 1.3),
      velocityY: randomBetween(0.5, 4.5),
      active: true,
    };

    arepa.className = 'page-pause-arepa';
    arepa.type = 'button';
    arepa.setAttribute('aria-label', `Explode arepa ${index + 1}`);
    arepa.style.backgroundImage = `url("${arepaImageUrl}")`;
    arepa.style.setProperty('--arepa-size', `${size}px`);
    arepa.addEventListener('click', () => handleClick(state));
    stage.append(arepa);
    arepas.push(state);
  }

  function animate(timestamp: number): void {
    if (!running) return;

    const delta = Math.min(2, (timestamp - lastFrame) / 16.67 || 1);
    lastFrame = timestamp;

    for (const arepa of arepas) {
      if (!arepa.active) continue;

      arepa.velocityY += 0.38 * delta;
      arepa.x += arepa.velocityX * delta;
      arepa.y += arepa.velocityY * delta;

      const maxX = Math.max(0, window.innerWidth - arepa.size);
      const maxY = Math.max(0, window.innerHeight - arepa.size);

      if (arepa.x <= 0 || arepa.x >= maxX) {
        arepa.x = Math.max(0, Math.min(maxX, arepa.x));
        arepa.velocityX *= -0.84;
      }

      if (arepa.y >= maxY) {
        arepa.y = maxY;
        arepa.velocityY *= -0.62;
        if (Math.abs(arepa.velocityY) < 1.5) {
          arepa.velocityY = -randomBetween(3.5, 6.5);
        }
      }

    }

    for (let pass = 0; pass < 8; pass += 1) {
      for (let firstIndex = 0; firstIndex < arepas.length; firstIndex += 1) {
        const first = arepas[firstIndex];
        if (!first.active) continue;

        for (let secondIndex = firstIndex + 1; secondIndex < arepas.length; secondIndex += 1) {
          const second = arepas[secondIndex];
          if (!second.active) continue;

          const firstRadius = first.size / 2;
          const secondRadius = second.size / 2;
          const firstCenterX = first.x + firstRadius;
          const firstCenterY = first.y + firstRadius;
          const secondCenterX = second.x + secondRadius;
          const secondCenterY = second.y + secondRadius;
          const differenceX = secondCenterX - firstCenterX;
          const differenceY = secondCenterY - firstCenterY;
          const distance = Math.hypot(differenceX, differenceY);
          const minimumDistance = firstRadius + secondRadius + 1;

          if (distance >= minimumDistance) continue;

          const normalX = distance === 0 ? 1 : differenceX / distance;
          const normalY = distance === 0 ? 0 : differenceY / distance;
          const overlap = minimumDistance - (distance || 0);
          const firstMass = first.size * first.size;
          const secondMass = second.size * second.size;
          const totalMass = firstMass + secondMass;

          first.x -= normalX * overlap * (secondMass / totalMass);
          first.y -= normalY * overlap * (secondMass / totalMass);
          second.x += normalX * overlap * (firstMass / totalMass);
          second.y += normalY * overlap * (firstMass / totalMass);

          const relativeVelocityX = second.velocityX - first.velocityX;
          const relativeVelocityY = second.velocityY - first.velocityY;
          const velocityAlongNormal =
            relativeVelocityX * normalX + relativeVelocityY * normalY;

          if (velocityAlongNormal < 0) {
            const impulse = -(1.1 * velocityAlongNormal) /
              ((1 / firstMass) + (1 / secondMass));
            first.velocityX -= (impulse * normalX) / firstMass;
            first.velocityY -= (impulse * normalY) / firstMass;
            second.velocityX += (impulse * normalX) / secondMass;
            second.velocityY += (impulse * normalY) / secondMass;
          }
        }
      }
    }

    for (const arepa of arepas) {
      if (!arepa.active) continue;

      const maxX = Math.max(0, window.innerWidth - arepa.size);
      const maxY = Math.max(0, window.innerHeight - arepa.size);
      arepa.x = Math.max(0, Math.min(maxX, arepa.x));
      arepa.y = Math.max(0, Math.min(maxY, arepa.y));
      arepa.element.style.transform = `translate3d(${arepa.x}px, ${arepa.y}px, 0)`;
    }

    animationFrame = window.requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    for (const arepa of arepas) {
      arepa.x = Math.min(arepa.x, Math.max(0, window.innerWidth - arepa.size));
      arepa.y = Math.min(arepa.y, Math.max(0, window.innerHeight - arepa.size));
    }
  });

  animationFrame = window.requestAnimationFrame(animate);
}

async function blockCurrentPage(): Promise<void> {
  const currentUrl = new URL(window.location.href);
  const runtime = getExtensionApi()?.runtime;

  if (!runtime) {
    return;
  }

  const blockedPage = new URL(runtime.getURL('blocked.html'));
  blockedPage.searchParams.set('url', currentUrl.toString());
  window.location.replace(blockedPage.toString());
}

async function blockUnlessWhitelisted(): Promise<void> {
  const hostname = new URL(window.location.href).hostname;

  if (await isHostnameWhitelisted(hostname)) {
    return;
  }

  const punishmentKey = getPunishmentKey(hostname);
  const pendingPunishment = await getPendingPunishment(hostname);

  if (pendingPunishment) {
    const start = () => void mountArepaPunishment(pendingPunishment, punishmentKey);

    if (document.body) {
      start();
    } else {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    }
    return;
  }

  await blockCurrentPage();
}

void blockUnlessWhitelisted();
