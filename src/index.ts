export {};

const TRIGGER_SOURCE = 'colombian-shooter-extension';
const TRIGGER_TYPE = 'run';
const WHITELIST_PREFIX = 'colombian-shooter:whitelist:';
const WHITELIST_DURATION = 30 * 60 * 1000;

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

async function whitelistHostname(hostname: string): Promise<void> {
  const storage = getExtensionApi()?.storage?.local;

  if (!storage) {
    return;
  }

  await storage.set({
    [getWhitelistKey(hostname)]: Date.now() + WHITELIST_DURATION,
  });
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

let skipRequested = false;

async function allowCurrentPage(): Promise<void> {
  skipRequested = true;
  await whitelistHostname(new URL(window.location.href).hostname);
}

async function blockUnlessWhitelisted(): Promise<void> {
  const hostname = new URL(window.location.href).hostname;

  if (skipRequested || (await isHostnameWhitelisted(hostname))) {
    return;
  }

  await blockCurrentPage();
}

let triggerInjected = false;

function exposeTrigger(): void {
  const runtime = getExtensionApi()?.runtime;
  const parent = document.head ?? document.documentElement;

  if (!runtime || triggerInjected) {
    return;
  }

  if (!parent) {
    document.addEventListener('DOMContentLoaded', exposeTrigger, { once: true });
    return;
  }

  triggerInjected = true;
  const script = document.createElement('script');
  script.src = runtime.getURL('trigger.js');
  script.onload = () => script.remove();
  parent.append(script);
}

window.addEventListener('message', (event: MessageEvent) => {
  if (
    event.source === window &&
    event.data?.source === TRIGGER_SOURCE &&
    event.data?.type === TRIGGER_TYPE
  ) {
    void allowCurrentPage();
  }
});

exposeTrigger();
void blockUnlessWhitelisted();
