import { getPunishmentById } from './punishments/registry.js';

const WHITELIST_PREFIX = 'page-pause:whitelist:';
const PUNISHMENT_PREFIX = 'page-pause:punishment:';

type ExtensionApi = typeof browser;

type PendingPunishment = {
  url: string;
  duration: number;
  /** Which wedge the punishment wheel landed on. See punishments/registry.js. */
  punishment: string;
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

    const pending = candidate as { url?: unknown; duration?: unknown; punishment?: unknown };
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
      // An unknown or missing id falls back to the first punishment in the
      // registry, so an old stored record never leaves a page unpunished.
      punishment: typeof pending.punishment === 'string' ? pending.punishment : '',
    };
  } catch {
    return undefined;
  }
}

/**
 * Runs the punishment the wheel picked. Everything it needs to end the sentence
 * — the pass, the cleanup, the redirect — is handed over as `grantPass`, so a
 * punishment only has to decide *when* the user is done.
 */
function servePunishment(pending: PendingPunishment, punishmentKey: string): void {
  const extensionApi = getExtensionApi();
  const storage = extensionApi?.storage?.local;

  if (!storage || !extensionApi) {
    return;
  }

  getPunishmentById(pending.punishment).mount({
    url: pending.url,
    duration: pending.duration,
    getAssetUrl: (path: string) => extensionApi.runtime.getURL(path),
    grantPass: async () => {
      await storage.set({
        [getWhitelistKey(new URL(pending.url).hostname)]: Date.now() + pending.duration,
      });
      await storage.remove(punishmentKey);
      window.location.replace(pending.url);
    },
  });
}

async function blockCurrentPage(): Promise<void> {
  const currentUrl = new URL(window.location.href);
  const runtime = getExtensionApi()?.runtime;

  if (!runtime) {
    return;
  }

  const blockedPage = new URL(runtime.getURL('pages/blocked.html'));
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
    const start = () => servePunishment(pendingPunishment, punishmentKey);

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
