# Page Pause

A small cross-browser browser extension built with [Extension.js](https://extension.js.org) + TypeScript. It blocks webpages until you spend one token, then allows the current hostname for 30 minutes.

## Setup

```bash
bun install
```

## Develop

```bash
bun dev
# opens the extension in a fresh browser profile with hot reload
```

The token balance starts at zero and persists across tabs and browser restarts.
The placeholder game currently awards one token per click. Spending one token
spins a 50/50 Safe or Punishment wheel, then whitelists the current
hostname for 30 minutes. Punishment effects are not implemented yet. A small
toolbar badge shows the balance when it is above zero.

## Build

```bash
bun build:chrome    # → dist/chrome-mv3-prod
bun build:firefox   # → dist/firefox-mv2-prod
bun build:edge      # → dist/edge-mv3-prod
```

## Structure

```
src/
  background.ts      # updates the toolbar token badge
  manifest.json      # cross-browser manifest (MV3 Chrome/Edge, MV2 Firefox)
  index.ts           # document-start all-page blocker
  blocked.html       # extension-owned interstitial page
  blocked.js         # interstitial behavior
  blocked.css        # interstitial styling
  images/icon.png
extension.config.js  # per-browser profile config
extension-env.d.ts   # Extension.js + webextension-polyfill types (gitignored)
```

Project created with `bun init` + Extension.js `init` template.
