# colombian-shooter-extension

A small cross-browser browser extension built with [Extension.js](https://extension.js.org) + TypeScript. It redirects webpages to an extension-owned interstitial, then allows the current hostname for 30 minutes when you continue.

## Setup

```bash
bun install
```

## Develop

```bash
bun dev
# opens the extension in a fresh browser profile with hot reload
```

The content script blocks every normal webpage unless its hostname is currently
whitelisted. Clicking Continue whitelists that hostname for 30 minutes across
tabs and browser restarts.

You can also whitelist the current hostname from that page's console with:

```js
runColombianShooter()
```

That function whitelists the current hostname for 30 minutes, just like
clicking Continue.

## Build

```bash
bun build:chrome    # → dist/chrome-mv3-prod
bun build:firefox   # → dist/firefox-mv2-prod
bun build:edge      # → dist/edge-mv3-prod
```

## Structure

```
src/
  manifest.json      # cross-browser manifest (MV3 Chrome/Edge, MV2 Firefox)
  index.ts           # document-start all-page blocker and JS trigger bridge
  blocked.html       # extension-owned interstitial page
  blocked.js         # interstitial behavior
  blocked.css        # interstitial styling
  trigger.js         # exposes runColombianShooter() to page JavaScript
  images/icon.png
extension.config.js  # per-browser profile config
extension-env.d.ts   # Extension.js + webextension-polyfill types (gitignored)
```

Project created with `bun init` + Extension.js `init` template.
