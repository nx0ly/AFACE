/*
 * La cosecha: buy your way off the page for 5,000 mangos.
 *
 * Mangos are a currency, not a progress bar — freedom sits in the shop next to
 * the upgrades and competes with them for the same pile. Spending on a machete
 * gets you there faster but sets the pile back, which is the whole tension.
 *
 * This was a minigame first, which is why it has a combo meter and an upgrade
 * tree — they are what keep 5,000 from being 5,000 literal clicks. Nothing is
 * persisted: walking away means starting the harvest over.
 */

import { createPunishmentPanel } from './overlay.js';

const TARGET = 5_000;

const COMBO_WINDOW = 700;
const COMBO_STEP = 0.25;
const COMBO_MAX = 4;

// Rejects autoclickers without punishing genuinely fast human clicking (~28/s).
const MIN_CLICK_GAP = 35;

const UPGRADES = [
  { id: 'machete', name: 'Sharper machete', desc: '+1 per pick', base: 15, growth: 1.35 },
  { id: 'grove', name: 'Another tree', desc: '+0.5 per second', base: 60, growth: 1.45 },
  { id: 'basket', name: 'Bigger basket', desc: '+25% to everything', base: 600, growth: 2.2 },
];

/** @param {import('./registry.js').PunishmentContext} context */
function mount(context) {
  const panel = createPunishmentPanel({
    title: 'La cosecha',
    subtitle: `Buy your way out for ${TARGET.toLocaleString()} mangos.`,
  });

  if (!panel) {
    return;
  }

  const state = { mangos: 0, machete: 0, grove: 0, basket: 0 };

  let combo = 1;
  let lastClick = 0;
  let comboTimer = 0;
  let finished = false;

  const multiplier = () => Math.pow(1.25, state.basket);
  const clickPower = () => (1 + state.machete) * multiplier();
  const perSecond = () => state.grove * 0.5 * multiplier();
  const costOf = (upgrade) => Math.ceil(upgrade.base * Math.pow(upgrade.growth, state[upgrade.id]));

  const orchard = document.createElement('div');
  const mango = document.createElement('button');
  const meter = document.createElement('div');
  const fill = document.createElement('div');
  const shop = document.createElement('div');

  orchard.className = 'page-pause-mango-orchard';
  mango.className = 'page-pause-mango';
  mango.type = 'button';
  mango.setAttribute('aria-label', 'Pick a mango');
  mango.style.setProperty(
    'background-image',
    `url("${context.getAssetUrl('images/mango.png')}")`,
    'important',
  );
  meter.className = 'page-pause-mango-meter';
  fill.className = 'page-pause-mango-fill';
  shop.className = 'page-pause-mango-shop';

  meter.append(fill);
  orchard.append(mango);
  panel.panel.append(orchard, meter, panel.status, shop);

  // Freedom is the first thing in the shop: it is a purchase like any other,
  // and it is what the upgrades below are competing with for the same mangos.
  const freedomButton = document.createElement('button');

  freedomButton.className = 'page-pause-mango-buy page-pause-mango-freedom';
  freedomButton.type = 'button';
  freedomButton.addEventListener('click', () => {
    if (state.mangos < TARGET) return;

    state.mangos -= TARGET;
    finish();
  });
  shop.append(freedomButton);

  /** @type {HTMLButtonElement[]} */
  const shopButtons = UPGRADES.map((upgrade) => {
    const button = document.createElement('button');

    button.className = 'page-pause-mango-buy';
    button.type = 'button';
    button.addEventListener('click', () => {
      const cost = costOf(upgrade);
      if (state.mangos < cost) return;

      state.mangos -= cost;
      state[upgrade.id] += 1;
      render();
    });

    shop.append(button);
    return button;
  });

  function render() {
    const pile = Math.floor(state.mangos);

    panel.status.textContent = finished
      ? 'Paid · returning to your page…'
      : `${pile.toLocaleString()} / ${TARGET.toLocaleString()} mangos`;
    fill.style.setProperty('width', `${Math.min(100, (pile / TARGET) * 100)}%`, 'important');

    freedomButton.disabled = state.mangos < TARGET;
    freedomButton.textContent =
      `Buy your way out · ${TARGET.toLocaleString()} mangos`;

    UPGRADES.forEach((upgrade, index) => {
      const button = shopButtons[index];
      const cost = costOf(upgrade);
      const owned = state[upgrade.id];

      button.disabled = state.mangos < cost;
      button.textContent =
        `${upgrade.name}${owned ? ` (${owned})` : ''} · ${upgrade.desc} · ${Math.round(cost).toLocaleString()}`;
    });
  }

  function finish() {
    if (finished) return;
    finished = true;

    render();
    void context.grantPass().catch(() => {
      finished = false;
      panel.status.textContent = 'The basket tipped over — keep picking.';
    });
  }

  function earn(amount) {
    if (finished) return;

    state.mangos += amount;
  }

  function pop(x, y, amount) {
    const label = document.createElement('span');

    label.className = 'page-pause-mango-pop';
    label.textContent = `+${Math.round(amount)}`;
    label.style.setProperty('left', `${x}px`, 'important');
    label.style.setProperty('top', `${y}px`, 'important');
    label.addEventListener('animationend', () => label.remove(), { once: true });
    orchard.append(label);
  }

  mango.addEventListener('pointerdown', (event) => {
    if (!event.isTrusted || finished) return;

    const now = performance.now();
    if (now - lastClick < MIN_CLICK_GAP) return;

    combo = now - lastClick < COMBO_WINDOW ? Math.min(COMBO_MAX, combo + COMBO_STEP) : 1;
    lastClick = now;

    const gain = clickPower() * combo;
    earn(gain);

    const rect = orchard.getBoundingClientRect();
    pop(event.clientX - rect.left, event.clientY - rect.top, gain);

    mango.classList.add('is-squished');
    window.setTimeout(() => mango.classList.remove('is-squished'), 90);

    window.clearTimeout(comboTimer);
    comboTimer = window.setTimeout(() => {
      combo = 1;
    }, COMBO_WINDOW);

    render();
  });

  mango.addEventListener('dragstart', (event) => event.preventDefault());
  mango.addEventListener('contextmenu', (event) => event.preventDefault());

  // Idle income from the grove, so buying trees actually shortens the sentence.
  let lastTick = performance.now();

  const tick = (now) => {
    if (finished) return;

    const passive = perSecond() * ((now - lastTick) / 1_000);
    lastTick = now;

    if (passive > 0) {
      earn(passive);
      render();
    }

    window.requestAnimationFrame(tick);
  };

  render();
  window.requestAnimationFrame(tick);
}

/** @type {import('./registry.js').Punishment} */
export const mangoHarvest = {
  id: 'mango-harvest',
  label: 'Mango harvest',
  color: '#f7a726',
  textColor: '#2f1d10',
  taunt: 'Five thousand mangos are not going to pick themselves.',
  mount,
};
