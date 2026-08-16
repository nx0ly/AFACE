/*
 * Capybara wash: a filthy capybara stumbles onto the page, stops in the middle
 * to look extremely pleased with itself, and will not leave until you have
 * scrubbed it clean.
 *
 * The mud is a canvas laid over the sprite and erased with `destination-out`,
 * but only partially per stroke — one swipe fades the dirt instead of deleting
 * it, so the same patch has to be worked over and over. That grind is the
 * punishment; a full-strength eraser turned it into a two-second wipe.
 *
 * The sponge is a physics object rather than a cursor decoration: it falls in,
 * bounces, settles on the floor, and has to be picked up before any scrubbing
 * can happen.
 */

// Sprite aspect ratios, so the box always matches the artwork and `contain`
// never letterboxes it — the mud canvas is aligned to that box.
const WALK_ASPECT = 872 / 1156;
const SMUG_ASPECT = 1194 / 1566;

const CAPY_HEIGHT_VH = 46;
const WALK_IN_MS = 4_200;
const TURN_PAUSE_MS = 700;
const SMUG_STARE_MS = 1_400;
const WALK_OUT_MS = 3_200;

const CLEAN_TARGET = 0.95;
const BRUSH_RADIUS = 24;
// How much dirt one pass lifts. Well under 1 on purpose — see the header.
const SCRUB_STRENGTH = 0.14;

// Gravity matches arepa-rain so falling things across the extension share a weight.
const SPONGE_GRAVITY = 2_600; // px/s²
const SPONGE_RESTITUTION = 0.42;
const SPONGE_FRICTION = 0.78;
const SPONGE_REST_ANGLE = -8;

/* Desaturated grey-browns. Saturated chocolate browns read as something other
   than mud, which is not the joke we are going for. */
const MUD_TONES = [
  [78, 64, 46],
  [96, 82, 62],
  [64, 53, 39],
  [110, 96, 74],
];

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/** @param {import('./registry.js').PunishmentContext} context */
function mount(context) {
  if (!document.body || document.querySelector('.page-pause-capy-overlay')) {
    return;
  }

  const overlay = document.createElement('div');
  const capy = document.createElement('div');
  const body = document.createElement('div');
  const shadow = document.createElement('div');
  const spriteWalk = document.createElement('img');
  const spriteSmug = document.createElement('img');
  const mud = document.createElement('canvas');
  const sponge = document.createElement('img');
  const progress = document.createElement('div');
  const progressFill = document.createElement('div');

  overlay.className = 'page-pause-capy-overlay';
  capy.className = 'page-pause-capy';
  body.className = 'page-pause-capy-body';
  shadow.className = 'page-pause-capy-shadow';
  spriteWalk.className = 'page-pause-capy-sprite page-pause-capy-sprite-walk';
  spriteSmug.className = 'page-pause-capy-sprite page-pause-capy-sprite-smug page-pause-capy-hidden';
  mud.className = 'page-pause-capy-mud';
  sponge.className = 'page-pause-capy-sponge';
  progress.className = 'page-pause-capy-progress';
  progressFill.className = 'page-pause-capy-progress-fill';

  spriteWalk.src = context.getAssetUrl('images/capybara/walk.png');
  spriteSmug.src = context.getAssetUrl('images/capybara/smug.png');
  sponge.src = context.getAssetUrl('images/capybara/sponge.png');
  // Without these the host page lets you drag the capybara out as an image,
  // which kills the scrub stroke halfway through.
  for (const image of [spriteWalk, spriteSmug, sponge]) {
    image.draggable = false;
    image.alt = '';
  }

  body.append(spriteWalk, spriteSmug, mud);
  capy.append(shadow, body);
  progress.append(progressFill);
  overlay.append(capy, sponge, progress);
  document.body.append(overlay);

  const canvas = mud.getContext('2d', { willReadFrequently: true });

  if (!canvas) {
    overlay.remove();
    return;
  }

  let phase = 'idle';
  let lastPoint = null;
  let mudPixels = 0;
  let running = true;
  let footIndex = 0;
  let spongeFrame = 0;
  let spongeLast = 0;

  const spongeState = {
    x: 0, y: 0,
    velocityX: 0, velocityY: 0,
    rotation: 0, spin: 0,
    squish: 1,
    held: false, landed: false, active: false,
  };

  const sleep = (ms) => new Promise((resolve, reject) => {
    window.setTimeout(() => (running ? resolve() : reject(new Error('cancelled'))), ms);
  });

  function layout() {
    // Floored like arepa-rain: a 0-height tab would otherwise collapse the
    // animal to nothing and leave no mud to scrub.
    const height = Math.max(240, window.innerHeight) * (CAPY_HEIGHT_VH / 100);
    const aspect = phase === 'smug' || phase === 'scrub' ? SMUG_ASPECT : WALK_ASPECT;
    capy.style.setProperty('--page-pause-capy-h', `${height}px`);
    capy.style.setProperty('--page-pause-capy-w', `${height * aspect}px`);
  }

  /**
   * An irregular patch: a closed curve whose radius wanders per vertex, so no
   * two are the same shape and none of them are round.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {number[]} tone
   * @param {number} alpha
   */
  function splat(x, y, radius, tone, alpha) {
    const points = Math.round(randomBetween(8, 13));
    const [red, green, blue] = tone;
    const vertices = [];

    for (let index = 0; index < points; index += 1) {
      const angle = (index / points) * Math.PI * 2;
      // Squashed on the vertical, the way a thrown splat lands.
      const reach = radius * randomBetween(0.55, 1.35);
      vertices.push({ x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach * 0.8 });
    }

    canvas.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(2)})`;
    canvas.beginPath();
    canvas.moveTo(
      (vertices[points - 1].x + vertices[0].x) / 2,
      (vertices[points - 1].y + vertices[0].y) / 2,
    );

    // Midpoints as curve anchors and vertices as control points: the outline
    // stays smooth and closed however far the radii wander.
    for (let index = 0; index < points; index += 1) {
      const current = vertices[index];
      const next = vertices[(index + 1) % points];
      canvas.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }

    canvas.closePath();
    canvas.fill();
  }

  /** Paint a fresh coat of mud sized to the current sprite box. */
  function paintMud() {
    const rect = capy.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;

    mud.width = Math.max(1, Math.round(rect.width * ratio));
    mud.height = Math.max(1, Math.round(rect.height * ratio));
    canvas.setTransform(ratio, 0, 0, ratio, 0, 0);
    canvas.clearRect(0, 0, rect.width, rect.height);
    canvas.globalCompositeOperation = 'source-over';
    canvas.globalAlpha = 1;

    // Mud stops short of the face — the smug look is the whole point of the
    // pause, so dirt is not allowed to cover it.
    const faceLine = rect.height * (phase === 'smug' || phase === 'scrub' ? 0.5 : 0.34);

    // Base coat: the animal is caked, not spotted. This is what makes it read
    // as dirty all over instead of as a handful of odd-shaped patches.
    const coat = canvas.createLinearGradient(0, faceLine - rect.height * 0.1, 0, rect.height);
    coat.addColorStop(0, 'rgba(74, 61, 44, 0)');
    coat.addColorStop(0.3, 'rgba(70, 58, 42, 0.66)');
    coat.addColorStop(1, 'rgba(54, 44, 32, 0.86)');
    canvas.fillStyle = coat;
    canvas.fillRect(0, 0, rect.width, rect.height);

    // Mottling, at low alpha. These only break up the flat wash — at full
    // strength they were shapes you noticed rather than dirt.
    for (let index = 0; index < 26; index += 1) {
      splat(
        randomBetween(0, rect.width),
        randomBetween(faceLine - rect.height * 0.05, rect.height),
        randomBetween(rect.width * 0.06, rect.width * 0.18),
        MUD_TONES[index % MUD_TONES.length],
        randomBetween(0.16, 0.34),
      );
    }

    // Drips: mud runs downhill, and the vertical streaks are most of what tells
    // the eye this is wet dirt.
    for (let index = 0; index < 10; index += 1) {
      const x = randomBetween(rect.width * 0.15, rect.width * 0.85);
      const y = randomBetween(faceLine, rect.height * 0.8);
      const length = randomBetween(rect.height * 0.05, rect.height * 0.16);
      const width = randomBetween(rect.width * 0.012, rect.width * 0.032);

      canvas.fillStyle = `rgba(84, 70, 50, ${randomBetween(0.45, 0.68).toFixed(2)})`;
      canvas.beginPath();
      canvas.ellipse(x, y + length / 2, width, length / 2, 0, 0, Math.PI * 2);
      canvas.fill();
      // The bead of mud that collects at the bottom of a run.
      splat(x, y + length, width * 1.6, MUD_TONES[0], randomBetween(0.5, 0.7));
    }

    // Spray: fine flecks thrown up by its own feet.
    for (let index = 0; index < 130; index += 1) {
      const size = randomBetween(1.5, 5);
      canvas.fillStyle = `rgba(70, 58, 42, ${randomBetween(0.35, 0.65).toFixed(2)})`;
      canvas.beginPath();
      canvas.ellipse(
        randomBetween(0, rect.width),
        randomBetween(faceLine * 0.85, rect.height),
        size,
        size * randomBetween(0.5, 0.9),
        randomBetween(0, Math.PI),
        0,
        Math.PI * 2,
      );
      canvas.fill();
    }

    // Clip everything to the capybara's own outline. Without this, spray and
    // splat edges that land beyond the animal hang in mid-air beside it — the
    // canvas is a rectangle, the capybara is not.
    const sprite = phase === 'smug' || phase === 'scrub' ? spriteSmug : spriteWalk;

    if (sprite.naturalWidth > 0) {
      canvas.globalCompositeOperation = 'destination-in';
      canvas.drawImage(sprite, 0, 0, rect.width, rect.height);
      canvas.globalCompositeOperation = 'source-over';
    }

    mud.style.setProperty('opacity', '1', 'important');
    mudPixels = countMud();
  }

  /** Alpha coverage, sampled on a coarse grid — exact counts are not worth the cost. */
  function countMud() {
    const { width, height } = mud;

    if (width < 2 || height < 2) {
      return 0;
    }

    const data = canvas.getImageData(0, 0, width, height).data;
    const step = 4 * 6; // every 6th pixel
    let count = 0;

    for (let index = 3; index < data.length; index += step) {
      if (data[index] > 24) count += 1;
    }

    return count;
  }

  function updateProgress() {
    if (mudPixels === 0) {
      return 1;
    }

    const cleaned = 1 - countMud() / mudPixels;
    progressFill.style.setProperty('width', `${Math.min(100, (cleaned / CLEAN_TARGET) * 100)}%`, 'important');
    return cleaned;
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  function eraseAt(clientX, clientY) {
    const rect = capy.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    canvas.globalCompositeOperation = 'destination-out';
    canvas.globalAlpha = SCRUB_STRENGTH;
    canvas.lineCap = 'round';
    canvas.lineJoin = 'round';
    canvas.lineWidth = BRUSH_RADIUS * 2;
    canvas.strokeStyle = 'rgba(0, 0, 0, 1)';
    canvas.beginPath();
    canvas.moveTo(lastPoint ? lastPoint.x : x, lastPoint ? lastPoint.y : y);
    canvas.lineTo(x, y);
    canvas.stroke();
    // Everything else on this canvas paints at full strength — leaving the
    // alpha turned down would quietly wash out the next coat of mud.
    canvas.globalAlpha = 1;
    lastPoint = { x, y };
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  function spawnBubble(clientX, clientY) {
    const bubble = document.createElement('span');
    const size = randomBetween(10, 26);

    bubble.className = 'page-pause-capy-bubble';
    bubble.style.setProperty('width', `${size}px`, 'important');
    bubble.style.setProperty('height', `${size}px`, 'important');
    bubble.style.setProperty('left', `${clientX + randomBetween(-30, 30)}px`, 'important');
    bubble.style.setProperty('top', `${clientY + randomBetween(-20, 20)}px`, 'important');
    bubble.addEventListener('animationend', () => bubble.remove(), { once: true });
    overlay.append(bubble);
  }

  /** @param {number} x */
  function dropFootprint(x) {
    const print = document.createElement('span');
    const rect = capy.getBoundingClientRect();
    const isLeftFoot = (footIndex += 1) % 2 === 0;
    // Sized and placed off the animal itself, so feet and prints stay matched
    // at any viewport size instead of drifting apart.
    const width = rect.width * 0.13;
    const stagger = rect.height * 0.009;

    print.className = 'page-pause-capy-print';
    print.style.setProperty('width', `${width}px`, 'important');
    print.style.setProperty('height', `${width * 0.42}px`, 'important');
    print.style.setProperty('left', `${x + randomBetween(-width * 0.3, width * 0.3)}px`, 'important');
    // Tucked up into the sole rather than resting on the box bottom: the body
    // wobbles as it walks, so a print pinned to the exact bottom edge reads as
    // floating below the feet for most of the stride.
    print.style.setProperty(
      'top',
      `${rect.bottom - rect.height * 0.035 + (isLeftFoot ? stagger : -stagger)}px`,
      'important',
    );
    print.addEventListener('animationend', () => print.remove(), { once: true });
    overlay.append(print);
  }

  /** The line the sponge rests on: the same ground the capybara stands on. */
  function spongeFloor() {
    return window.innerHeight * 0.94 - sponge.offsetHeight * 0.3;
  }

  function renderSponge() {
    sponge.style.setProperty(
      'transform',
      `translate3d(${spongeState.x}px, ${spongeState.y}px, 0) translate(-50%, -50%)` +
        ` rotate(${spongeState.rotation.toFixed(1)}deg)` +
        ` scale(${(2 - spongeState.squish).toFixed(3)}, ${spongeState.squish.toFixed(3)})`,
      'important',
    );
  }

  /** @param {number} now */
  function stepSponge(now) {
    if (!spongeState.active || !running) {
      return;
    }

    // Clamped so a backgrounded tab doesn't fire one enormous catch-up step.
    const delta = Math.min(0.032, Math.max(0.001, (now - spongeLast) / 1_000));
    spongeLast = now;

    if (!spongeState.held) {
      spongeState.velocityY += SPONGE_GRAVITY * delta;
      spongeState.x += spongeState.velocityX * delta;
      spongeState.y += spongeState.velocityY * delta;
      spongeState.rotation += spongeState.spin * delta;

      const floor = spongeFloor();

      if (spongeState.y >= floor) {
        spongeState.y = floor;

        if (spongeState.velocityY > 70) {
          spongeState.velocityY = -spongeState.velocityY * SPONGE_RESTITUTION;
          // Squash on impact, and kick the spin the other way.
          spongeState.squish = 0.78;
          spongeState.spin *= -0.45;
        } else {
          spongeState.velocityY = 0;
          spongeState.landed = true;
        }

        spongeState.velocityX *= SPONGE_FRICTION;
        spongeState.spin *= SPONGE_FRICTION;
      }

      // Keep it on screen — a sponge that skids out of reach is unpickupable.
      const margin = sponge.offsetWidth * 0.5;

      if (spongeState.x < margin) {
        spongeState.x = margin;
        spongeState.velocityX = Math.abs(spongeState.velocityX) * 0.4;
      } else if (spongeState.x > window.innerWidth - margin) {
        spongeState.x = window.innerWidth - margin;
        spongeState.velocityX = -Math.abs(spongeState.velocityX) * 0.4;
      }

      if (spongeState.landed) {
        // Settle flat instead of freezing at whatever angle it landed on.
        spongeState.rotation += (SPONGE_REST_ANGLE - spongeState.rotation) * Math.min(1, delta * 7);
        spongeState.spin = 0;
        sponge.classList.add('page-pause-capy-pickable');
      }
    }

    // Squish always eases back out, whether it came from a bounce or a scrub.
    spongeState.squish += (1 - spongeState.squish) * Math.min(1, delta * 9);

    renderSponge();
    spongeFrame = window.requestAnimationFrame(stepSponge);
  }

  /** Toss the sponge in from off-screen so it falls, bounces and settles. */
  function dropSponge() {
    spongeState.x = window.innerWidth * 0.7;
    spongeState.y = -sponge.offsetHeight;
    spongeState.velocityX = randomBetween(-60, 20);
    spongeState.velocityY = 0;
    spongeState.rotation = randomBetween(-50, 50);
    spongeState.spin = randomBetween(-260, 260);
    spongeState.squish = 1;
    spongeState.held = false;
    spongeState.landed = false;
    spongeState.active = true;

    sponge.classList.add('page-pause-capy-visible');
    sponge.classList.remove('page-pause-capy-pickable');
    renderSponge();

    spongeLast = performance.now();
    window.cancelAnimationFrame(spongeFrame);
    spongeFrame = window.requestAnimationFrame(stepSponge);
  }

  function hideSponge() {
    spongeState.active = false;
    spongeState.held = false;
    window.cancelAnimationFrame(spongeFrame);
    sponge.classList.remove('page-pause-capy-visible', 'page-pause-capy-pickable');
    overlay.classList.remove('page-pause-capy-holding');
  }

  /**
   * Ease the capybara between two viewport fractions, stumbling the whole way.
   * `leavesPrints` is false on the way out — by then it has been scrubbed, and
   * a clean animal has nothing left to track across the page.
   *
   * @param {number} from
   * @param {number} to
   * @param {number} duration
   * @param {boolean} leavesPrints
   * @returns {Promise<void>}
   */
  function walkTo(from, to, duration, leavesPrints) {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      let lastPrint = 0;

      const frame = (now) => {
        if (!running) {
          return reject(new Error('cancelled'));
        }

        const progressed = Math.min(1, (now - start) / duration);
        // Slight ease-out on arrival, so the stumble lands rather than stopping dead.
        const eased = 1 - Math.pow(1 - progressed, 1.6);
        const position = from + (to - from) * eased;
        capy.style.setProperty('--page-pause-capy-t', position.toFixed(4));

        if (leavesPrints && now - lastPrint > 260) {
          dropFootprint(position * window.innerWidth);
          lastPrint = now;
        }

        if (progressed < 1) {
          window.requestAnimationFrame(frame);
        } else {
          resolve();
        }
      };

      window.requestAnimationFrame(frame);
    });
  }

  /** @param {'walk' | 'smug'} which */
  function showSprite(which) {
    spriteWalk.classList.toggle('page-pause-capy-hidden', which !== 'walk');
    spriteSmug.classList.toggle('page-pause-capy-hidden', which !== 'smug');
  }

  function waitForClean() {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!running) {
          return reject(new Error('cancelled'));
        }

        if (updateProgress() >= CLEAN_TARGET) {
          return resolve();
        }

        window.requestAnimationFrame(check);
      };

      window.requestAnimationFrame(check);
    });
  }

  // Picking the sponge up is the sponge's own job — the element is only
  // clickable once it has come to rest, so no manual hit testing is needed.
  sponge.addEventListener('pointerdown', (event) => {
    if (phase !== 'scrub' || spongeState.held) {
      return;
    }

    event.preventDefault();
    spongeState.held = true;
    spongeState.velocityX = 0;
    spongeState.velocityY = 0;
    spongeState.spin = 0;
    spongeState.x = event.clientX;
    spongeState.y = event.clientY;
    lastPoint = null;
    sponge.classList.remove('page-pause-capy-pickable');
    overlay.classList.add('page-pause-capy-holding');
  });

  overlay.addEventListener('pointermove', (event) => {
    if (!spongeState.held) {
      return;
    }

    spongeState.x = event.clientX;
    spongeState.y = event.clientY;

    // In hand, contact is the scrub — there is no second button to hold down.
    const rect = capy.getBoundingClientRect();
    const overCapy =
      event.clientX > rect.left && event.clientX < rect.right &&
      event.clientY > rect.top && event.clientY < rect.bottom;

    if (overCapy) {
      eraseAt(event.clientX, event.clientY);
      spongeState.squish = 0.9;
      if (Math.random() < 0.35) spawnBubble(event.clientX, event.clientY);
    } else {
      lastPoint = null;
    }
  });

  // A scrub stroke is a drag, and the host page would otherwise try to turn it
  // into a native image or text drag.
  overlay.addEventListener('dragstart', (event) => event.preventDefault());

  window.addEventListener('resize', () => {
    layout();
    if (phase === 'walk-in' || phase === 'smug') paintMud();
  });

  async function play() {
    try {
      // 1 — stumble in from the left.
      phase = 'walk-in';
      layout();
      showSprite('walk');
      capy.classList.add('page-pause-capy-walking');
      paintMud();
      capy.style.setProperty('--page-pause-capy-t', '-0.2');
      await walkTo(-0.2, 0.5, WALK_IN_MS, true);

      // 2 — turn, face you, look extremely pleased with itself.
      phase = 'smug';
      capy.classList.remove('page-pause-capy-walking');
      layout();
      showSprite('smug');
      paintMud();
      capy.classList.add('page-pause-capy-smug');
      await sleep(TURN_PAUSE_MS + SMUG_STARE_MS);

      // 3 — pick up the sponge and scrub it clean.
      phase = 'scrub';
      progress.classList.add('page-pause-capy-visible');
      dropSponge();
      await waitForClean();

      // 4 — clean, smug about that too, then off it goes.
      phase = 'leaving';
      capy.classList.remove('page-pause-capy-smug');
      hideSponge();
      progress.classList.remove('page-pause-capy-visible');
      mud.style.setProperty('opacity', '0', 'important');
      await sleep(900);

      showSprite('walk');
      layout();
      capy.classList.add('page-pause-capy-walking');
      await walkTo(0.5, 1.2, WALK_OUT_MS, false);

      phase = 'done';
      await context.grantPass();
    } catch {
      // grantPass never resolves on success — the page navigates away. Getting
      // here means it failed, so hand the sponge back rather than trapping the
      // page with a clean capybara and no way out.
      if (running && phase === 'done') {
        phase = 'scrub';
        paintMud();
        progress.classList.add('page-pause-capy-visible');
        capy.style.setProperty('--page-pause-capy-t', '0.5');
        dropSponge();
        void waitForClean().then(() => context.grantPass()).catch(() => {});
      }
    }
  }

  void play();
}

/** @type {import('./registry.js').Punishment} */
export const capybaraWash = {
  id: 'capybara-wash',
  label: 'Capybara wash',
  color: '#a9652b',
  textColor: '#ffe6c2',
  taunt: 'Something filthy is waddling onto your page…',
  mount,
};
