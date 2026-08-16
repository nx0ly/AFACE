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
const POPUP_MIN = 200;
const POPUP_MAX = 300;
const SPEED = 140; // px/s, uniform; bounce off walls and each other

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

/** @param {number} min @param {number} max @returns {number} */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
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

  overlay.className = 'page-pause-ad-overlay';
  document.body.append(overlay);

  const status = document.createElement('div');
  status.className = 'page-pause-ad-status';
  status.textContent = `Close ${TARGET_CLOSES} popups to escape · ${closedCount}/${TARGET_CLOSES}`;
  overlay.append(status);

  const finish = async () => {
    if (finished) return;
    finished = true;
    running = false;
    window.cancelAnimationFrame(animationFrame);
    status.textContent = `All cleared · returning to your page…`;

    try {
      await context.grantPass();
    } catch {
      finished = false;
      running = true;
      status.textContent = `Could not save your pass — close another popup.`;
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

    const w = Math.round(randomBetween(POPUP_MIN, POPUP_MAX));
    const h = Math.round(randomBetween(POPUP_MIN, POPUP_MAX));
    const x = spawnX ?? randomBetween(8, Math.max(8, window.innerWidth - w - 8));
    const y = spawnY ?? randomBetween(8, Math.max(8, window.innerHeight - h - 8));

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
    status.textContent =
      closedCount >= TARGET_CLOSES
        ? `All cleared · returning to your page…`
        : `Close ${TARGET_CLOSES} popups to escape · ${closedCount}/${TARGET_CLOSES}`;

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
          randomBetween(
            Math.max(0, centerX - 120),
            Math.min(window.innerWidth - POPUP_MIN, centerX + 120),
          ),
          randomBetween(
            Math.max(0, centerY - 120),
            Math.min(window.innerHeight - POPUP_MIN, centerY + 120),
          ),
        );
      }
    }
  }

  /** @param {Popup} state */
  function bounceWalls(state) {
    const maxX = Math.max(0, window.innerWidth - state.w);
    const maxY = Math.max(0, window.innerHeight - state.h);

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

  let last = performance.now();

  /** @param {number} now */
  function animate(now) {
    if (!running) return;

    const delta = Math.min(0.05, (now - last) / 1_000);
    last = now;

    for (const state of popups) {
      if (state.dragging) continue;

      state.x += state.vx * delta;
      state.y += state.vy * delta;
      bounceWalls(state);

      state.element.style.setProperty('--popup-x', `${state.x}px`, 'important');
      state.element.style.setProperty('--popup-y', `${state.y}px`, 'important');
    }

    animationFrame = window.requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    for (const state of popups) {
      state.x = Math.min(state.x, Math.max(0, window.innerWidth - state.w));
      state.y = Math.min(state.y, Math.max(0, window.innerHeight - state.h));
    }
  });

  for (let i = 0; i < INITIAL_POPUPS; i += 1) createPopup(i);
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