export {};

const WHITELIST_PREFIX = 'page-pause:whitelist:';

type ExtensionApi = typeof browser;

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

  await blockCurrentPage();
}

void blockUnlessWhitelisted();
