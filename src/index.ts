import {
  CONTINUE_PARAM,
  isYouTubeUrl,
  removeContinueMarker,
} from './blocker/youtube';

/** Runs at document_start, before YouTube has a chance to render. */
function blockYouTube(): void {
  const currentUrl = new URL(window.location.href);

  if (!isYouTubeUrl(currentUrl)) {
    return;
  }

  // The interstitial adds this marker when the user explicitly chooses to
  // continue. Remove it immediately so the address bar stays clean.
  if (currentUrl.searchParams.has(CONTINUE_PARAM)) {
    removeContinueMarker(currentUrl);
    window.history.replaceState(null, '', currentUrl.toString());
    return;
  }

  // Extension.js exposes `browser` in Firefox and `chrome` in Chromium.
  // Resolve the runtime at the edge so the blocker itself stays browser-agnostic.
  const extensionGlobal = globalThis as typeof globalThis & {
    browser?: typeof browser;
    chrome?: typeof browser;
  };
  const runtime =
    extensionGlobal.browser?.runtime ?? extensionGlobal.chrome?.runtime;

  if (!runtime) {
    return;
  }
  const blockedPage = new URL(runtime.getURL('blocked.html'));
  blockedPage.searchParams.set('url', window.location.href);
  window.location.replace(blockedPage.toString());
}

blockYouTube();
