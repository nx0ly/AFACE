export {};

const WHITELIST_PREFIX = 'page-pause:whitelist:';
const PUNISHMENT_PREFIX = 'page-pause:punishment:';
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

type ExtensionApi = typeof browser;

type PendingPunishment = {
  url: string;
  duration: number;
};

function getExtensionApi(): ExtensionApi | undefined {
  const extensionGlobal = globalThis as typeof globalThis & {
    browser?: ExtensionApi;
    chrome?: ExtensionApi;
  };

  return extensionGlobal.browser ?? extensionGlobal.chrome;
}

function getWhitelistKey(hostname: string): string {
  return `${WHITELIST_PREFIX}${hostname}`;
}

function getPunishmentKey(hostname: string): string {
  return `${PUNISHMENT_PREFIX}${hostname}`;
}

async function isHostnameWhitelisted(hostname: string): Promise<boolean> {
  const storage = getExtensionApi()?.storage?.local;

  if (!storage) {
    return false;
  }

  const key = getWhitelistKey(hostname);
  try {
    const saved = await storage.get(key);
    const expiresAt = saved[key];

    if (typeof expiresAt !== 'number') {
      return false;
    }

    if (expiresAt > Date.now()) {
      return true;
    }

    await storage.remove(key);
    return false;
  } catch {
    // If storage is unavailable, keep the blocker active.
    return false;
  }
}

async function getPendingPunishment(hostname: string): Promise<PendingPunishment | undefined> {
  const storage = getExtensionApi()?.storage?.local;

  if (!storage) {
    return undefined;
  }

  try {
    const saved = await storage.get(getPunishmentKey(hostname));
    const candidate = saved[getPunishmentKey(hostname)];

    if (!candidate || typeof candidate !== 'object') {
      return undefined;
    }

    const pending = candidate as { url?: unknown; duration?: unknown };
    const targetUrl = typeof pending.url === 'string' ? new URL(pending.url) : undefined;

    if (
      !targetUrl ||
      (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') ||
      targetUrl.hostname !== hostname ||
      typeof pending.duration !== 'number' ||
      !Number.isFinite(pending.duration) ||
      pending.duration <= 0
    ) {
      return undefined;
    }

    return {
      url: targetUrl.toString(),
      duration: pending.duration,
    };
  } catch {
    return undefined;
  }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

type ArepaState = {
  element: HTMLButtonElement;
  x: number;
  y: number;
  size: number;
  radius: number;
  /** Inverse mass, proportional to 1/area — small arepas get shoved by big ones. */
  invMass: number;
  /** Set once at spawn and never changed — arepas slide and stack, they don't spin. */
  rotation: number;
  releaseAt: number;
  released: boolean;
  velocityX: number;
  velocityY: number;
  active: boolean;
};

/**
 * Mixed arepa sizes that together cover slightly more than the viewport, so the pile
 * reaches the top edge and spills past it. Sizes are drawn until the area target is
 * hit rather than counted up front, which keeps the coverage right whatever the mix.
 */
function getArepaSizes(): number[] {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const base = Math.max(72, Math.min(180, Math.round(Math.min(width, height) * 0.16)));
  const targetArea = width * height * 1.2;
  const sizes: number[] = [];
  let area = 0;

  while (area < targetArea && sizes.length < 180) {
    const size = Math.round(base * randomBetween(0.62, 1.3));
    sizes.push(size);
    area += size * size;
  }

  // Biggest first: they land at the bottom and the small ones trickle into the gaps.
  return sizes.sort((first, second) => second - first);
}

function explodeArepa(stage: HTMLElement, x: number, y: number): void {
  const colors = ['#f6d37a', '#d8943e', '#a9652b', '#fff0b5'];

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

async function mountArepaPunishment(
  pending: PendingPunishment,
  punishmentKey: string,
): Promise<void> {
  const extensionApi = getExtensionApi();
  const storage = extensionApi?.storage?.local;

  if (!storage || !document.body || document.querySelector('.page-pause-arepa-overlay')) {
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
  const arepas: ArepaState[] = [];
  const arepaImageUrl = extensionApi.runtime.getURL('images/arepa.png');
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
  status.textContent = `${remaining} arepas left · click to explode`;
  overlay.append(stage, status);
  document.body.append(overlay);

  const finish = async (): Promise<void> => {
    running = false;
    window.cancelAnimationFrame(animationFrame);
    status.textContent = 'All exploded · returning to your page…';

    try {
      await storage.set({
        [getWhitelistKey(new URL(pending.url).hostname)]: Date.now() + pending.duration,
      });
      await storage.remove(punishmentKey);
      window.location.replace(pending.url);
    } catch {
      status.textContent = 'Almost there — could not save your pass. Try again.';
      running = true;
      animationFrame = window.requestAnimationFrame(animate);
    }
  };

  const handleClick = (arepa: ArepaState): void => {
    if (!arepa.active) return;

    arepa.active = false;
    const centerX = arepa.x + arepa.size / 2;
    const centerY = arepa.y + arepa.size / 2;
    arepa.element.remove();
    explodeArepa(stage, centerX, centerY);
    remaining -= 1;
    status.textContent = remaining === 0
      ? 'All exploded · returning to your page…'
      : `${remaining} arepa${remaining === 1 ? '' : 's'} left · click to explode`;

    if (remaining === 0) {
      void finish();
    }
  };

  for (let index = 0; index < count; index += 1) {
    const arepa = document.createElement('button');
    const size = sizes[index];
    const state: ArepaState = {
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
    arepa.setAttribute('aria-label', `Explode arepa ${index + 1}`);
    arepa.style.setProperty('left', '0px', 'important');
    arepa.style.setProperty('top', '0px', 'important');
    arepa.style.setProperty('visibility', 'hidden', 'important');
    arepa.style.setProperty('background-image', `url("${arepaImageUrl}")`, 'important');
    arepa.style.setProperty('--arepa-size', `${size}px`);
    arepa.style.setProperty('--arepa-rotation', `${state.rotation}deg`);
    arepa.addEventListener('click', () => handleClick(state));
    stage.append(arepa);
    arepas.push(state);
  }

  function applyBounds(arepa: ArepaState): void {
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

  /** Uniform-grid broadphase: only arepas in neighbouring cells can possibly touch. */
  function collectPairs(): Array<[ArepaState, ArepaState]> {
    // Cells sized to the biggest arepa, so no arepa can straddle more than one cell edge.
    const cellSize = largestSize;
    const grid = new Map<string, ArepaState[]>();
    const pairs: Array<[ArepaState, ArepaState]> = [];

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
      for (const [offsetX, offsetY] of [[1, 0], [-1, 1], [0, 1], [1, 1]] as const) {
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

  function resolveContacts(): void {
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

  function step(delta: number): void {
    for (const arepa of arepas) {
      if (!arepa.active || !arepa.released) continue;

      arepa.velocityY += GRAVITY * delta;
      arepa.x += arepa.velocityX * delta;
      arepa.y += arepa.velocityY * delta;
    }

    resolveContacts();
  }

  function animate(timestamp: number): void {
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

async function blockCurrentPage(): Promise<void> {
  const currentUrl = new URL(window.location.href);
  const runtime = getExtensionApi()?.runtime;

  if (!runtime) {
    return;
  }

  const blockedPage = new URL(runtime.getURL('pages/blocked.html'));
  blockedPage.searchParams.set('url', currentUrl.toString());
  window.location.replace(blockedPage.toString());
}

async function blockUnlessWhitelisted(): Promise<void> {
  const hostname = new URL(window.location.href).hostname;

  if (await isHostnameWhitelisted(hostname)) {
    return;
  }

  const punishmentKey = getPunishmentKey(hostname);
  const pendingPunishment = await getPendingPunishment(hostname);

  if (pendingPunishment) {
    const start = () => void mountArepaPunishment(pendingPunishment, punishmentKey);

    if (document.body) {
      start();
    } else {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    }
    return;
  }

  await blockCurrentPage();
}

void blockUnlessWhitelisted();
