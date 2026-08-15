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
The Games page includes Tejo and roulette. Scoring in Tejo or
landing on green in roulette awards one token. Spending one token
spins a 50/50 Safe or Doom wheel. Safe whitelists the current hostname for
30 minutes; Doom spins a *second* wheel — one wedge per registered punishment —
and sends you back to the target page to serve whichever one it lands on. The
pass is granted once the punishment is over. A small toolbar badge shows the
balance when it is above zero.

## Punishments

Every punishment lives in `src/punishments/` and is listed in
`src/punishments/registry.js`. The Wheel of Doom builds its wedges from that
array, so adding one is two steps:

1. Copy a punishment file (`bank-queue.js` is the smallest) and edit it. It
   exports `{ id, label, color, textColor, taunt, mount }`; `mount(context)`
   runs on the blocked page and calls `context.grantPass()` when the user has
   served their sentence.
2. Import it in `registry.js` and add it to `PUNISHMENTS`.

`punishments/overlay.js` provides the shared panel chrome, and any CSS the
punishments need goes in `src/punishment.css` (namespaced `page-pause-*`, since
it is injected into arbitrary host pages).

Shipping today: arepa rain, la fila del banco, and la penitencia.

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
  index.ts           # document-start all-page blocker + punishment dispatch
  punishments/       # one file per punishment, listed in registry.js
  punishment.css     # styles injected into host pages by the content script
  blocked.html       # extension-owned interstitial page
  blocked.js         # interstitial behavior
  blocked.css        # interstitial styling
  images/icon.png
extension.config.js  # per-browser profile config
extension-env.d.ts   # Extension.js + webextension-polyfill types (gitignored)
```

Project created with `bun init` + Extension.js `init` template.
