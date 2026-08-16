/*
 * La invasión de anuncios: the page drowns under a youareanidiot.cc-style
 * flood of bouncing fake-ad popups and you have to close your way out.
 *
 * Each popup is a little draggable window advertising hot capybaras and
 * hackathons. They bounce around the viewport like DVD logos with a grudge.
 * Closing one spawns a couple more, so the screen gets worse before it gets
 * better — but every close counts toward a target. Hit the target and you go
 * free; the flood drains with you.
 */

const TARGET_CLOSES = 20;
// How many new popups each closed popup births. >1 means the flood grows even
// as you fight it, so closing fast is the only way out. Kept small so the DOM
// never explodes — see POPUP_CAP.
const SPAWN_PER_CLOSE = 0;
// Hard ceiling on live popups. The spawn-on-close loop can run away; this caps
// the worst case so a panicked page never paints ten thousand windows.
const POPUP_CAP = 60;
// Starting wave — enough to feel instantly overwhelming, not enough to lock up.
const INITIAL_POPUPS = 20;
// Put back this many when the pass fails to save, so there is always something
// left to close instead of an empty page that never lets you out.
const RETRY_POPUPS = 3;
// Popups are sized to the viewport (see popupSideFor) so a full wave always
// fits on screen with room to click each one. These are just the end stops.
const POPUP_MIN = 120;
const POPUP_MAX = 300;
const SPEED = 140; // px/s, uniform; bounce off walls and each other
// Fallback viewport used when the tab has no layout yet — a background tab
// reports innerWidth 0, and without this every popup lands on the same pixel.
const FALLBACK_VIEW_W = 1024;
const FALLBACK_VIEW_H = 768;

const TITLES = [
  '🔥 HOT CAPYBARAS IN YOUR AREA',
  'HOW DID THIS GET HERE?!',
  'You are the 1,000,000th visitor',
  'Holaaa — mirá esto',
  'locals in your area · CLICK NOW',
  'This popup will self-destruct',
  '1 WEIRD TRICK hosts hate',
  '¿Quieres una arepa gratis?',
];

/** @typedef {object} Popup */
/**
 * @typedef {object} Popup
 * @property {HTMLElement} element
 * @property {number} w
 * @property {number} h
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {boolean} dragging
 * @property {number} dragOffsetX
 * @property {number} dragOffsetY
 */

/** @param {number} value @param {number} min @param {number} max @returns {number} */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** @param {number} min @param {number} max @returns {number} */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * The viewport we lay popups out in. A tab that has never been painted (opened
 * in the background, or still loading) reports innerWidth/innerHeight as 0, and
 * every popup would then be clamped onto the same corner pixel — a 20-deep
 * stack where only the top one can be clicked. `known` says whether these are
 * real measurements, so the caller can re-scatter once the tab wakes up.
 * @returns {{ w: number, h: number, known: boolean }}
 */
function getViewport() {
  const w = window.innerWidth || document.documentElement?.clientWidth || 0;
  const h = window.innerHeight || document.documentElement?.clientHeight || 0;

  return w > 0 && h > 0
    ? { w, h, known: true }
    : { w: FALLBACK_VIEW_W, h: FALLBACK_VIEW_H, known: false };
}

/**
 * Side length for one popup: small enough that a whole wave fits on screen
 * without burying itself, clamped to the sizes that still read as a fake ad.
 * @param {{ w: number, h: number }} view
 * @param {number} count
 * @returns {number}
 */
function popupSideFor(view, count) {
  // Roughly `count` cells tiled over the viewport; a popup fills most of one.
  const cell = Math.sqrt((view.w * view.h) / Math.max(1, count));
  return Math.max(POPUP_MIN, Math.min(POPUP_MAX, Math.round(cell * 0.8)));
}

/**
 * Jittered grid slots covering the viewport, shuffled so consecutive spawns
 * don't march in reading order. Popups start apart instead of in a heap.
 * @param {{ w: number, h: number }} view
 * @param {number} count
 * @param {number} side
 * @returns {{ x: number, y: number }[]}
 */
function scatterSlots(view, count, side) {
  const columns = Math.max(1, Math.ceil(Math.sqrt((count * view.w) / Math.max(1, view.h))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellW = view.w / columns;
  const cellH = view.h / rows;
  /** @type {{ x: number, y: number }[]} */
  const slots = [];

  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns) % rows;
    const slackX = Math.max(0, cellW - side);
    const slackY = Math.max(0, cellH - side);

    slots.push({
      x: Math.min(Math.max(0, view.w - side), column * cellW + randomBetween(0, slackX)),
      y: Math.min(Math.max(0, view.h - side), row * cellH + randomBetween(0, slackY)),
    });
  }

  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  return slots;
}

/** @param {import('./registry.js').PunishmentContext} context */
function mount(context) {
  if (!document.body || document.querySelector('.page-pause-ad-overlay')) {
    return;
  }

  const overlay = document.createElement('div');
  /** @type {Popup[]} */
  const popups = [];
  /** @type {string[]} */
  const adImageUrls = [
    context.getAssetUrl('images/ads/hot_capy_ad.jpg'),
    context.getAssetUrl('images/ads/hackathon1.png'),
  ];
  let closedCount = 0;
  let animationFrame = 0;
  let running = true;
  let finished = false;
  let view = getViewport();
  let side = popupSideFor(view, INITIAL_POPUPS);

  overlay.className = 'page-pause-ad-overlay';
  document.body.append(overlay);

  const finish = async () => {
    if (finished) return;
    finished = true;
    running = false;
    window.cancelAnimationFrame(animationFrame);

    try {
      await context.grantPass();
    } catch {
      // The pass did not save, so the sentence is not over. There is no counter
      // left to explain that, and the flood has already drained — so put a small
      // wave back on screen and let closing it retry. Without this you are left
      // on a silent, empty page with nothing to click.
      finished = false;
      running = true;
      closedCount = TARGET_CLOSES - RETRY_POPUPS;
      side = popupSideFor(view, RETRY_POPUPS);

      const slots = scatterSlots(view, RETRY_POPUPS, side);

      for (let i = 0; i < RETRY_POPUPS; i += 1) createPopup(i, slots[i].x, slots[i].y);
      last = performance.now();
      animationFrame = window.requestAnimationFrame(animate);
    }
  };

  /**
   * @param {number} index
   * @param {number} [spawnX]
   * @param {number} [spawnY]
   * @returns {Popup}
   */
  function createPopup(index, spawnX, spawnY) {
    const popup = document.createElement('div');
    const titleBar = document.createElement('div');
    const fake = document.createElement('div');
    const title = document.createElement('span');
    const close = document.createElement('button');
    const img = document.createElement('img');

    const w = Math.round(side * randomBetween(0.85, 1));
    const h = Math.round(side * randomBetween(0.85, 1));
    const x = clamp(spawnX ?? randomBetween(0, Math.max(0, view.w - w)), 0, Math.max(0, view.w - w));
    const y = clamp(spawnY ?? randomBetween(0, Math.max(0, view.h - h)), 0, Math.max(0, view.h - h));

    // Pick a random direction; never pure horizontal/vertical so they don't
    // bounce forever along one axis.
    const angle = randomBetween(0, Math.PI * 2);
    const vx = Math.cos(angle) * SPEED;
    const vy = Math.sin(angle) * SPEED;

    popup.className = 'page-pause-ad-popup';
    titleBar.className = 'page-pause-ad-titlebar';
    fake.className = 'page-pause-ad-fake';
    title.className = 'page-pause-ad-title';
    close.className = 'page-pause-ad-close';
    img.className = 'page-pause-ad-img';

    title.textContent = TITLES[index % TITLES.length];
    close.type = 'button';
    close.setAttribute('aria-label', 'Close popup');
    close.textContent = '×';
    img.src = adImageUrls[index % adImageUrls.length];
    img.alt = 'Hot capybaras in your area';
    img.draggable = false;

    fake.append(title, close);
    titleBar.append(fake);
    popup.append(titleBar, img);
    overlay.append(popup);

    popup.style.setProperty('--popup-x', `${x}px`, 'important');
    popup.style.setProperty('--popup-y', `${y}px`, 'important');
    popup.style.setProperty('--popup-w', `${w}px`, 'important');
    popup.style.setProperty('--popup-h', `${h}px`, 'important');

    /** @type {Popup} */
    const state = {
      element: popup,
      w,
      h,
      x,
      y,
      vx,
      vy,
      dragging: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
    };

    // Anywhere on the window closes it — title bar, ad image, the × button.
    popup.addEventListener('pointerdown', (event) => {
      if (!event.isTrusted) return;
      event.stopPropagation();
      handleClose(state);
    });

    popups.push(state);
    return state;
  }

  /** @param {Popup} state */
  function removePopup(state) {
    state.element.remove();
    const idx = popups.indexOf(state);
    if (idx >= 0) popups.splice(idx, 1);
  }

  /** @param {Popup} state */
  function handleClose(state) {
    if (finished) return;

    // Closing this popup births a few more near where it was — unless we are
    // already at the cap, which keeps the DOM honest.
    const centerX = state.x + state.w / 2;
    const centerY = state.y + state.h / 2;
    removePopup(state);

    closedCount += 1;

    if (closedCount >= TARGET_CLOSES) {
      // Drain the flood: everything left leaves at once, then we are done.
      for (const other of [...popups]) removePopup(other);
      void finish();
      return;
    }

    if (popups.length + SPAWN_PER_CLOSE <= POPUP_CAP) {
      for (let i = 0; i < SPAWN_PER_CLOSE; i += 1) {
        createPopup(
          popups.length + i,
          randomBetween(centerX - side, centerX + side),
          randomBetween(centerY - side, centerY + side),
        );
      }
    }
  }

  /** @param {Popup} state */
  function bounceWalls(state) {
    const maxX = Math.max(0, view.w - state.w);
    const maxY = Math.max(0, view.h - state.h);

    if (state.x < 0) {
      state.x = 0;
      state.vx = Math.abs(state.vx);
    } else if (state.x > maxX) {
      state.x = maxX;
      state.vx = -Math.abs(state.vx);
    }

    if (state.y < 0) {
      state.y = 0;
      state.vy = Math.abs(state.vy);
    } else if (state.y > maxY) {
      state.y = maxY;
      state.vy = -Math.abs(state.vy);
    }
  }

  /**
   * Push overlapping popups apart and swap the velocities along the axis they
   * met on. Without this they drift straight through each other and settle into
   * stacks, where every popup but the top one is unclickable.
   */
  function bouncePopups() {
    for (let i = 0; i < popups.length; i += 1) {
      for (let j = i + 1; j < popups.length; j += 1) {
        const a = popups[i];
        const b = popups[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);

        if (overlapX <= 0 || overlapY <= 0) continue;

        // Separate along whichever axis they are least buried in — that is the
        // side they came in through.
        if (overlapX < overlapY) {
          const push = (overlapX / 2) * (a.x < b.x ? -1 : 1);
          a.x += push;
          b.x -= push;
          [a.vx, b.vx] = [b.vx, a.vx];
        } else {
          const push = (overlapY / 2) * (a.y < b.y ? -1 : 1);
          a.y += push;
          b.y -= push;
          [a.vy, b.vy] = [b.vy, a.vy];
        }

        bounceWalls(a);
        bounceWalls(b);
      }
    }
  }

  /**
   * Re-lay the whole flood over `view`. Used when the tab finally reports a real
   * viewport, so a wave that spawned blind doesn't stay heaped in the corner.
   */
  function rescatter() {
    side = popupSideFor(view, Math.max(1, popups.length));

    const slots = scatterSlots(view, popups.length, side);

    popups.forEach((state, index) => {
      state.w = Math.round(side * randomBetween(0.85, 1));
      state.h = Math.round(side * randomBetween(0.85, 1));
      state.x = clamp(slots[index].x, 0, Math.max(0, view.w - state.w));
      state.y = clamp(slots[index].y, 0, Math.max(0, view.h - state.h));
      state.element.style.setProperty('--popup-w', `${state.w}px`, 'important');
      state.element.style.setProperty('--popup-h', `${state.h}px`, 'important');
      state.element.style.setProperty('--popup-x', `${state.x}px`, 'important');
      state.element.style.setProperty('--popup-y', `${state.y}px`, 'important');
    });
  }

  /**
   * Swap a guessed viewport for a measured one the moment the tab can tell us,
   * re-laying the flood over the real screen. A tab that mounted hidden gets no
   * animation frames at all, so this also runs off visibilitychange/resize —
   * otherwise the fallback layout would survive, with its bottom row parked
   * below the fold where it can never be clicked.
   * @returns {boolean} Whether the layout was rebuilt.
   */
  function refreshViewport() {
    if (view.known) return false;

    const measured = getViewport();

    if (!measured.known) return false;

    view = measured;
    rescatter();
    return true;
  }

  let last = performance.now();

  /** @param {number} now */
  function animate(now) {
    if (!running) return;

    const delta = Math.min(0.05, (now - last) / 1_000);
    last = now;

    refreshViewport();

    for (const state of popups) {
      if (state.dragging) continue;

      state.x += state.vx * delta;
      state.y += state.vy * delta;
      bounceWalls(state);
    }

    bouncePopups();

    for (const state of popups) {
      state.element.style.setProperty('--popup-x', `${state.x}px`, 'important');
      state.element.style.setProperty('--popup-y', `${state.y}px`, 'important');
    }

    animationFrame = window.requestAnimationFrame(animate);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshViewport();
  });

  window.addEventListener('resize', () => {
    if (refreshViewport()) return;

    const measured = getViewport();

    if (!measured.known) return;

    view = measured;
    for (const state of popups) {
      state.x = clamp(state.x, 0, Math.max(0, view.w - state.w));
      state.y = clamp(state.y, 0, Math.max(0, view.h - state.h));
      state.element.style.setProperty('--popup-x', `${state.x}px`, 'important');
      state.element.style.setProperty('--popup-y', `${state.y}px`, 'important');
    }
  });

  const initialSlots = scatterSlots(view, INITIAL_POPUPS, side);

  for (let i = 0; i < INITIAL_POPUPS; i += 1) {
    createPopup(i, initialSlots[i].x, initialSlots[i].y);
  }
  animationFrame = window.requestAnimationFrame(animate);
}

/** @type {import('./registry.js').Punishment} */
export const adInvasion = {
  id: 'ad-invasion',
  label: 'Ad invasion',
  color: '#ff2d2d',
  textColor: '#ffffff',
  taunt: 'Hot capybaras in YOUR area — close your way out.',
  mount,
};