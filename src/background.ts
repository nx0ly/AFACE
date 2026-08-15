export {};

const TOKEN_BALANCE_KEY = 'page-pause:tokens';

type ToolbarAction = {
  setBadgeBackgroundColor(details: { color: string }): Promise<void> | void;
  setBadgeText(details: { text: string }): Promise<void> | void;
  setBadgeTextColor?: (details: { color: string }) => Promise<void> | void;
};

type ExtensionApi = typeof browser & {
  action?: ToolbarAction;
  browserAction?: ToolbarAction;
};

function getExtensionApi(): ExtensionApi | undefined {
  const extensionGlobal = globalThis as typeof globalThis & {
    browser?: ExtensionApi;
    chrome?: ExtensionApi;
  };

  return extensionGlobal.browser ?? extensionGlobal.chrome;
}

function normalizeBalance(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : 0;
}

async function updateBadge(): Promise<void> {
  const extensionApi = getExtensionApi();
  const toolbar = extensionApi?.action ?? extensionApi?.browserAction;

  if (!extensionApi || !toolbar) {
    return;
  }

  const saved = await extensionApi.storage.local.get(TOKEN_BALANCE_KEY);
  const balance = normalizeBalance(saved[TOKEN_BALANCE_KEY]);
  const text = balance === 0 ? '' : balance > 99 ? '99+' : String(balance);

  await toolbar.setBadgeBackgroundColor({ color: '#f2bf40' });
  await toolbar.setBadgeText({ text });

  if (toolbar.setBadgeTextColor) {
    await toolbar.setBadgeTextColor({ color: '#684d3a' });
  }
}

const extensionApi = getExtensionApi();

extensionApi?.storage.onChanged.addListener((
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  areaName: string,
) => {
  if (areaName === 'local' && TOKEN_BALANCE_KEY in changes) {
    void updateBadge();
  }
});

extensionApi?.runtime.onInstalled.addListener(() => void updateBadge());
extensionApi?.runtime.onStartup.addListener(() => void updateBadge());
void updateBadge();
