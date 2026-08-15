/*
 * Shared "rain" punishment: the page is buried under a pile of falling things
 * and you have to pop every one of them. The physics came from the original
 * arepa rain and is unchanged — only the skin is configurable, so a new rain
 * variant costs a dozen lines instead of four hundred.
 *
 * Call createRainPunishment() with a RainSkin; see arepa-rain.js for the
 * smallest example.
 */

/**
 * @typedef {object} RainSkin
 * @property {string} id
 * @property {string} label
 * @property {string} color Wheel wedge fill.
 * @property {string} textColor
 * @property {string} taunt
 * @property {string} image Packaged asset path, e.g. 'images/arepa.png'.
 * @property {string} noun Singular noun for the status line ("arepa").
 * @property {string[]} particleColors Confetti thrown on each pop.
 * @property {string} backgroundSize CSS background-size — arepas are zoomed
 *   discs, a basket has to fit inside its box.
 * @property {string} borderRadius CSS border-radius for the clickable box.
 */

// Physics runs on a fixed timestep so the fall feels the same on any monitor.
const PHYSICS_STEP = 1 / 240;
const GRAVITY = 2600; // px/s²
const PAIR_RESTITUTION = 0.18;
const FLOOR_RESTITUTION = 0.18;
const WALL_RESTITUTION = 0.3;
const CONTACT_FRICTION = 0.4;
const SOLVER_ITERATIONS = 4;
// A little tolerated overlap is what lets an over-packed pile actually come to rest.
const CORRECTION_PERCENT = 0.45;
const CORRECTION_SLOP = 1;
const RAIN_DURATION = 4_200;

/**
 * @typedef {object} ArepaState
 * @property {HTMLButtonElement} element
 * @property {number} x
 * @property {number} y
 * @property {number} size
 * @property {number} radius
 * @property {number} invMass Inverse mass, proportional to 1/area — small
 *   arepas get shoved by big ones.
 * @property {number} rotation Set once at spawn and never changed — arepas
 *   slide and stack, they don't spin.
 * @property {number} releaseAt
 * @property {boolean} released
 * @property {number} velocityX
 * @property {number} velocityY
 * @property {boolean} active
 */

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Mixed arepa sizes that together cover slightly more than the viewport, so the
 * pile reaches the top edge and spills past it. Sizes are drawn until the area
 * target is hit rather than counted up front, which keeps the coverage right
 * whatever the mix.
 *
 * @returns {number[]}
 */
function getArepaSizes() {
  // Floors matter: a tab that reports a 0×0 viewport (background/prerender) would
  // otherwise produce an empty pile with nothing to click, trapping the page.
  const width = Math.max(320, window.innerWidth);
  const height = Math.max(240, window.innerHeight);
  const base = Math.max(72, Math.min(180, Math.round(Math.min(width, height) * 0.16)));
  const targetArea = width * height * 1.2;
  const sizes = [];
  let area = 0;

  while (area < targetArea && sizes.length < 180) {
    const size = Math.round(base * randomBetween(0.62, 1.3));
    sizes.push(size);
    area += size * size;
  }

  // Biggest first: they land at the bottom and the small ones trickle into the gaps.
  return sizes.sort((first, second) => second - first);
}

/**
 * @param {HTMLElement} stage
 * @param {number} x
 * @param {number} y
 * @param {string[]} colors
 */
function explodeArepa(stage, x, y, colors) {
  for (let index = 0; index < 10; index += 1) {
    const particle = document.createElement('span');
    const angle = (index / 10) * Math.PI * 2;
    const distance = randomBetween(28, 92);

    particle.className = 'page-pause-arepa-particle';
    particle.style.left = `${x - 5}px`;
    particle.style.top = `${y - 5}px`;
    particle.style.setProperty('--particle-x', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--particle-y', `${Math.sin(angle) * distance}px`);
    particle.style.setProperty('--particle-color', colors[index % colors.length]);
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
    stage.append(particle);
  }
}

/**
 * @param {import('./registry.js').PunishmentContext} context
 * @param {RainSkin} skin
 */
function mount(context, skin) {
  if (!document.body || document.querySelector('.page-pause-arepa-overlay')) {
    return;
  }

  const overlay = document.createElement('div');
  const stage = document.createElement('div');
  const status = document.createElement('span');
  const sizes = getArepaSizes();
  const count = sizes.length;
  const largestSize = sizes[0];
  let remaining = count;
  let animationFrame = 0;
  let lastFrame = performance.now();
  let accumulator = 0;
  let running = true;
  /** @type {ArepaState[]} */
  const arepas = [];
  const arepaImageUrl = context.getAssetUrl(skin.image);
  const startedAt = performance.now();
  // Spread the rain evenly with a little jitter so it pours instead of arriving in clumps.
  const spawnOffsets = Array.from({ length: count }, (_unused, index) => {
    const slot = (index / count) * RAIN_DURATION;
    return Math.max(0, slot + randomBetween(-RAIN_DURATION / count, RAIN_DURATION / count));
  }).sort((first, second) => first - second);
  spawnOffsets[0] = 0;

  overlay.className = 'page-pause-arepa-overlay';
  stage.className = 'page-pause-arepa-stage';
  status.className = 'page-pause-arepa-status';
  status.setAttribute('aria-live', 'polite');
  status.textContent = `${remaining} ${skin.noun}s left · click to explode`;
  overlay.append(stage, status);
  document.body.append(overlay);

  const finish = async () => {
    running = false;
    window.cancelAnimationFrame(animationFrame);
    status.textContent = 'All exploded · returning to your page…';

    try {
      await context.grantPass();
    } catch {
      status.textContent = 'Almost there — could not save your pass. Try again.';
      running = true;
      animationFrame = window.requestAnimationFrame(animate);
    }
  };

  /** @param {ArepaState} arepa */
  const handleClick = (arepa) => {
    if (!arepa.active) return;

    arepa.active = false;
    const centerX = arepa.x + arepa.size / 2;
    const centerY = arepa.y + arepa.size / 2;
    arepa.element.remove();
    explodeArepa(stage, centerX, centerY, skin.particleColors);
    remaining -= 1;
    status.textContent = remaining === 0
      ? 'All exploded · returning to your page…'
      : `${remaining} ${skin.noun}${remaining === 1 ? '' : 's'} left · click to explode`;

    if (remaining === 0) {
      void finish();
    }
  };

  for (let index = 0; index < count; index += 1) {
    const arepa = document.createElement('button');
    const size = sizes[index];
    /** @type {ArepaState} */
    const state = {
      element: arepa,
      x: randomBetween(0, Math.max(0, window.innerWidth - size)),
      y: -size - randomBetween(0, size * 1.5),
      size,
      radius: size / 2,
      invMass: (largestSize * largestSize) / (size * size),
      rotation: randomBetween(-14, 14),
      releaseAt: startedAt + spawnOffsets[index],
      released: false,
      velocityX: randomBetween(-40, 40),
      velocityY: randomBetween(0, 120),
      active: true,
    };

    arepa.className = 'page-pause-arepa';
    arepa.type = 'button';
    arepa.setAttribute('aria-label', `Explode ${skin.noun} ${index + 1}`);
    arepa.style.setProperty('left', '0px', 'important');
    arepa.style.setProperty('top', '0px', 'important');
    arepa.style.setProperty('visibility', 'hidden', 'important');
    arepa.style.setProperty('background-image', `url("${arepaImageUrl}")`, 'important');
    arepa.style.setProperty('--arepa-size', `${size}px`);
    arepa.style.setProperty('--arepa-rotation', `${state.rotation}deg`);
    arepa.style.setProperty('--punish-bg-size', skin.backgroundSize);
    arepa.style.setProperty('--punish-radius', skin.borderRadius);
    arepa.addEventListener('click', () => handleClick(state));
    stage.append(arepa);
    arepas.push(state);
  }

  /** @param {ArepaState} arepa */
  function applyBounds(arepa) {
    const maxX = Math.max(0, window.innerWidth - arepa.size);
    const floorY = window.innerHeight - arepa.size;

    if (arepa.x < 0) {
      arepa.x = 0;
      if (arepa.velocityX < 0) arepa.velocityX = -arepa.velocityX * WALL_RESTITUTION;
    } else if (arepa.x > maxX) {
      arepa.x = maxX;
      if (arepa.velocityX > 0) arepa.velocityX = -arepa.velocityX * WALL_RESTITUTION;
    }

    if (arepa.y > floorY) {
      arepa.y = floorY;

      if (arepa.velocityY > 0) {
        // Small impacts stop dead instead of buzzing forever against the floor.
        arepa.velocityY = arepa.velocityY > 60 ? -arepa.velocityY * FLOOR_RESTITUTION : 0;
      }

      arepa.velocityX *= 1 - CONTACT_FRICTION;
    }
  }

  /**
   * Uniform-grid broadphase: only arepas in neighbouring cells can possibly touch.
   *
   * @returns {Array<[ArepaState, ArepaState]>}
   */
  function collectPairs() {
    // Cells sized to the biggest arepa, so no arepa can straddle more than one cell edge.
    const cellSize = largestSize;
    /** @type {Map<string, ArepaState[]>} */
    const grid = new Map();
    /** @type {Array<[ArepaState, ArepaState]>} */
    const pairs = [];

    for (const arepa of arepas) {
      if (!arepa.active || !arepa.released) continue;

      const cellX = Math.floor((arepa.x + arepa.radius) / cellSize);
      const cellY = Math.floor((arepa.y + arepa.radius) / cellSize);
      const key = `${cellX}:${cellY}`;
      const bucket = grid.get(key);

      if (bucket) {
        bucket.push(arepa);
      } else {
        grid.set(key, [arepa]);
      }
    }

    for (const [key, bucket] of grid) {
      const [cellX, cellY] = key.split(':').map(Number);

      for (let index = 0; index < bucket.length; index += 1) {
        for (let other = index + 1; other < bucket.length; other += 1) {
          pairs.push([bucket[index], bucket[other]]);
        }
      }

      // Half the neighbourhood, so each pair of cells is visited exactly once.
      for (const [offsetX, offsetY] of [[1, 0], [-1, 1], [0, 1], [1, 1]]) {
        const neighbour = grid.get(`${cellX + offsetX}:${cellY + offsetY}`);
        if (!neighbour) continue;

        for (const arepa of bucket) {
          for (const other of neighbour) {
            pairs.push([arepa, other]);
          }
        }
      }
    }

    return pairs;
  }

  function resolveContacts() {
    const pairs = collectPairs();

    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
      for (const [first, second] of pairs) {
        // Sizes differ, so this has to work off real centres, not top-left corners.
        const differenceX = second.x + second.radius - (first.x + first.radius);
        const differenceY = second.y + second.radius - (first.y + first.radius);
        const minimumDistance = first.radius + second.radius;
        const distanceSquared = differenceX * differenceX + differenceY * differenceY;

        if (distanceSquared >= minimumDistance * minimumDistance) continue;

        const distance = Math.sqrt(distanceSquared);
        const normalX = distance === 0 ? 1 : differenceX / distance;
        const normalY = distance === 0 ? 0 : differenceY / distance;
        const penetration = minimumDistance - distance;

        // Both push-out and impulses split by inverse mass: the lighter arepa moves more.
        const inverseMassSum = first.invMass + second.invMass;
        const correction =
          (Math.max(penetration - CORRECTION_SLOP, 0) * CORRECTION_PERCENT) / inverseMassSum;
        first.x -= normalX * correction * first.invMass;
        first.y -= normalY * correction * first.invMass;
        second.x += normalX * correction * second.invMass;
        second.y += normalY * correction * second.invMass;

        const relativeVelocityX = second.velocityX - first.velocityX;
        const relativeVelocityY = second.velocityY - first.velocityY;
        const velocityAlongNormal = relativeVelocityX * normalX + relativeVelocityY * normalY;

        if (velocityAlongNormal >= 0) continue;

        const normalImpulse =
          (-(1 + PAIR_RESTITUTION) * velocityAlongNormal) / inverseMassSum;
        first.velocityX -= normalImpulse * normalX * first.invMass;
        first.velocityY -= normalImpulse * normalY * first.invMass;
        second.velocityX += normalImpulse * normalX * second.invMass;
        second.velocityY += normalImpulse * normalY * second.invMass;

        const tangentX = -normalY;
        const tangentY = normalX;
        const velocityAlongTangent =
          relativeVelocityX * tangentX + relativeVelocityY * tangentY;
        const frictionImpulse =
          (-velocityAlongTangent * CONTACT_FRICTION) / inverseMassSum;
        first.velocityX -= frictionImpulse * tangentX * first.invMass;
        first.velocityY -= frictionImpulse * tangentY * first.invMass;
        second.velocityX += frictionImpulse * tangentX * second.invMass;
        second.velocityY += frictionImpulse * tangentY * second.invMass;
      }

      for (const arepa of arepas) {
        if (arepa.active && arepa.released) applyBounds(arepa);
      }
    }
  }

  /** @param {number} delta */
  function step(delta) {
    for (const arepa of arepas) {
      if (!arepa.active || !arepa.released) continue;

      arepa.velocityY += GRAVITY * delta;
      arepa.x += arepa.velocityX * delta;
      arepa.y += arepa.velocityY * delta;
    }

    resolveContacts();
  }

  /** @param {number} timestamp */
  function animate(timestamp) {
    if (!running) return;

    for (const arepa of arepas) {
      if (arepa.active && !arepa.released && timestamp >= arepa.releaseAt) {
        arepa.released = true;
        arepa.element.style.setProperty('visibility', 'visible', 'important');
      }
    }

    const frameDelta = (timestamp - lastFrame) / 1_000;
    lastFrame = timestamp;
    // Clamp so a backgrounded tab doesn't fire hundreds of catch-up steps at once.
    accumulator = Math.min(accumulator + (frameDelta > 0 ? frameDelta : PHYSICS_STEP), 0.1);

    while (accumulator >= PHYSICS_STEP) {
      step(PHYSICS_STEP);
      accumulator -= PHYSICS_STEP;
    }

    for (const arepa of arepas) {
      if (!arepa.active || !arepa.released) continue;

      arepa.element.style.setProperty(
        'transform',
        `translate3d(${arepa.x}px, ${arepa.y}px, 0) rotate(${arepa.rotation}deg)`,
        'important',
      );
    }

    animationFrame = window.requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    for (const arepa of arepas) {
      arepa.x = Math.min(arepa.x, Math.max(0, window.innerWidth - arepa.size));
      arepa.y = Math.min(arepa.y, window.innerHeight - arepa.size);
    }
  });

  animationFrame = window.requestAnimationFrame(animate);
}

/**
 * Builds a registry-ready punishment from a skin.
 *
 * @param {RainSkin} skin
 * @returns {import('./registry.js').Punishment}
 */
export function createRainPunishment(skin) {
  return {
    id: skin.id,
    label: skin.label,
    color: skin.color,
    textColor: skin.textColor,
    taunt: skin.taunt,
    mount: (context) => mount(context, skin),
  };
}
