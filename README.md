# colombian-shooter-extension

A small cross-browser browser extension built with [Extension.js](https://extension.js.org) + TypeScript. It redirects YouTube visits to an extension-owned interstitial; the visitor must click the continue button to open the requested YouTube URL.

## Setup

```bash
bun install
```

## Develop

```bash
bun dev
# opens the extension in a fresh browser profile with hot reload
```

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
  index.ts           # document-start YouTube blocker
  blocked.html       # extension-owned interstitial page
  blocked.js         # interstitial behavior
  blocked.css        # interstitial styling
  blocker/youtube.ts # shared URL matching and continuation logic
  images/icon.png
extension.config.js  # per-browser profile config
extension-env.d.ts   # Extension.js + webextension-polyfill types (gitignored)
```

Project created with `bun init` + Extension.js `init` template.
