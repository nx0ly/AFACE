# colombian-shooter-extension

A bare browser-extension scaffold built with [Extension.js](https://extension.js.org) + TypeScript. Nothing is wired up yet — no background, popup, or content script is registered in the manifest. Add them in `src/manifest.json` when you start building.

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
  index.ts           # placeholder — register this as a background/content script to activate
  images/icon.png
extension.config.js  # per-browser profile config
extension-env.d.ts   # Extension.js + webextension-polyfill types (gitignored)
```

Project created with `bun init` + Extension.js `init` template.