const WHITELIST_PREFIX = 'colombian-shooter:whitelist:';
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
const originalUrl = getOriginalUrl(window.location.search);

continueButton?.addEventListener('click', async () => {
  const storage = getStorage();

  if (!storage || originalUrl.protocol === 'about:') {
    return;
  }

  continueButton.disabled = true;
  await storage.set({
    [`${WHITELIST_PREFIX}${originalUrl.hostname}`]:
      Date.now() + WHITELIST_DURATION,
  });
  window.location.assign(originalUrl.toString());
});
