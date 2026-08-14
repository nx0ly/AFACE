const WHITELIST_PREFIX = 'page-pause:whitelist:';

const clearButton = document.querySelector('#clear-whitelist');
const status = document.querySelector('#status');

function getStorage() {
  return globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
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
