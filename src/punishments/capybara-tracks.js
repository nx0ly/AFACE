/*
 * Capybara tracks: a filthy capybara moves in and mows the page. It crosses
 * from one side to the other, shuffles up a row, crosses back, and keeps going
 * until the whole page is laid out in muddy prints. You do not get to wash the
 * capybara — the capybara is not the chore. The chore is the floor.
 *
 * The two halves are deliberately not mixed. While it is walking there is no
 * sponge and nothing to do but watch it plod, bit by bit, filling the page in
 * front of you. Only once it has finished and left does the sponge drop, and
 * by then every print it made is waiting for you. Prints never dry on their
 * own and each one takes several passes to lift, so the sentence is exactly as
 * long as the mess it just spent a minute making.
 *
 * The sponge is a physics object rather than a cursor decoration: it falls in,
 * bounces, settles on the floor, and has to be picked up before any scrubbing
 * can happen.
 */

// Sprite aspect ratios, so the box always matches the artwork and `contain`
// never letterboxes it — the mud canvas is aligned to that box.
const WALK_ASPECT = 872 / 1156;
const SMUG_ASPECT = 1194 / 1566;

// Smaller than it was when it only patrolled the bottom of the page: the route
// now runs to the top edge, and a shorter animal keeps its body on screen for
// more of the climb.
const CAPY_HEIGHT_VH = 20;

/* --- The route ---------------------------------------------------------
   Every number below is a target, not a measurement. The row count, the walking
   speed and the stride are all derived from the viewport at run time (see
   planRoute) so that a laptop and a 4K monitor get the same punishment: the
   whole page covered, in about the same amount of time, with about the same
   number of prints to scrub off afterwards. Hard-coding any of them makes one
   screen size unplayable. */

// Vertical gap between crossings. This is what "covered" means — at ~30px the
// tracks read as a page that has been walked over, not as a few stray trails.
const ROW_GAP_PX = 30;
// Rows are nudged off their exact spacing, and each crossing wanders around
// its own line instead of ruling it. Perfectly even rows look like a printer
// test page; an animal that walked here should not leave graph paper.
const ROW_JITTER_FRACTION = 0.45; // of ROW_GAP_PX
const ROW_DRIFT_FRACTION = 0.5; // of ROW_GAP_PX, within a single crossing
const ROW_SEGMENTS_MIN = 3;
const ROW_SEGMENTS_MAX = 6;
// How short of the edge a crossing may stop, as a share of its width, so the
// two ends of the page do not line up like a margin.
const ROW_END_SLACK = 0.08;
// Per-segment speed variation. Nothing about this animal is metronomic.
const SPEED_JITTER = 0.18;
// Row counts outside this range stop being funny in either direction.
const ROW_MIN = 12;
const ROW_MAX = 34;

// How long the whole mowing pass should take, pauses included. Speed is solved
// for from this, so adding rows makes the capybara brisker rather than making
// you wait twice as long. This is the dial to turn if the wait feels wrong.
const ROUTE_TARGET_MS = 80_000;
const WALK_SPEED_MIN = 200; // px/s
const WALK_SPEED_MAX = 900; // px/s

// Entrances and exits carry no prints and no jokes, so they are walked briskly.
const ENTRANCE_SPEED = 400; // px/s

// A crossing is walked in one continuous go. Breaking it into legs with a
// stand-around between each read as a dropped-frame stutter rather than as an
// animal dawdling, so the dawdling now happens where it looks deliberate: at
// the end of a row, where it has to turn around anyway.
const TURN_PAUSE_MIN_MS = 260;
const TURN_PAUSE_MAX_MS = 620;

const SMUG_STARE_MS = 1_800;

// Footfall spacing, as a share of the animal's own width, so the trail reads
// the same at any size. planRoute stretches it when the route would otherwise
// blow past PRINT_BUDGET.
const STRIDE_FRACTION = 0.4;
// Roughly how many prints the finished page should hold. It sets the length of
// the scrubbing half of the punishment, and it is also what keeps the print
// count off the page's rendering budget.
const PRINT_BUDGET = 720;
// Safety net only: planRoute is supposed to land under PRINT_BUDGET, and this
// catches the case where it somehow does not.
const MAX_LIVE_PRINTS = 1_100;

// Extra work if the pass fails to land and the capybara has to come back: two
// more crossings, and everything it drops on the way.
const RETRY_ROWS = 2;

// The sponge covers a wide swath, because a page of prints has to be cleanable
// in sweeps rather than one print at a time.
const SCRUB_RADIUS = 52;
// Dirt lifts per pixel the sponge actually travels, not per pointer event.
// Event counting rewarded twitching the mouse in place at 120Hz; distance
// makes you do the strokes, and makes a fast flick across a print worth
// exactly as much as it looks like it should be.
//
// Measured on a full page of ~375 prints: this is about seven serpentine
// sweeps of the viewport, ~100k pixels of dragging, a couple of minutes of
// actual scrubbing. Sweeps needed scale as 1/this, so halving it doubles the
// sentence.
const SCRUB_PER_PX = 0.0022;
// A single event's stroke is capped before it counts, so one enormous jump —
// a teleporting cursor, a dropped frame, a pointer re-entering the window —
// cannot wipe a print in one go.
const SCRUB_STEP_CAP_PX = 40;
// Not every print is equally baked on. The multiplier scales how much work a
// print takes, so a page has stubborn patches instead of a uniform grind.
const SCRUB_RESISTANCE_MIN = 0.85;
const SCRUB_RESISTANCE_MAX = 1.85;

// Gravity matches arepa-rain so falling things across the extension share a weight.
const SPONGE_GRAVITY = 2_600; // px/s²
const SPONGE_RESTITUTION = 0.42;
const SPONGE_FRICTION = 0.78;
const SPONGE_REST_ANGLE = -8;

// How much of the animal, measured up from the bottom of the sprite, is dirty.
// Feet and ankles only: it walked through mud, it did not roll in it, and a
// capybara caked to the ears reads as a different animal entirely.
const MUD_COVERAGE = 0.15;

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
  const floor = document.createElement('div');
  const capy = document.createElement('div');
  const body = document.createElement('div');
  const shadow = document.createElement('div');
  const spriteWalk = document.createElement('img');
  const spriteSmug = document.createElement('img');
  const mud = document.createElement('canvas');
  const sponge = document.createElement('img');
  const hud = document.createElement('div');
  const count = document.createElement('div');
  const progress = document.createElement('div');
  const progressFill = document.createElement('div');

  overlay.className = 'page-pause-capy-overlay';
  // Prints live in their own layer under the capybara, so the animal always
  // walks over its own trail instead of behind it.
  floor.className = 'page-pause-capy-floor';
  capy.className = 'page-pause-capy';
  body.className = 'page-pause-capy-body';
  shadow.className = 'page-pause-capy-shadow';
  spriteWalk.className = 'page-pause-capy-sprite page-pause-capy-sprite-walk';
  spriteSmug.className = 'page-pause-capy-sprite page-pause-capy-sprite-smug page-pause-capy-hidden';
  mud.className = 'page-pause-capy-mud';
  sponge.className = 'page-pause-capy-sponge';
  hud.className = 'page-pause-capy-hud';
  count.className = 'page-pause-capy-count';
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
  hud.append(count, progress);
  overlay.append(floor, capy, sponge, hud);
  document.body.append(overlay);

  const canvas = mud.getContext('2d');

  if (!canvas) {
    overlay.remove();
    return;
  }

  let phase = 'idle';
  let running = true;
  let footIndex = 0;
  // Prints stamped and prints scrubbed. The floor is clean when they match,
  // which is the only way out.
  let dropped = 0;
  let cleaned = 0;
  let spongeFrame = 0;
  let spongeLast = 0;

  // Solved once here so the entrance already has a stride to stamp with, and
  // again when the mowing starts (and on a retry) against the live viewport.
  let route = planRoute();

  /** Feet position, in viewport pixels — the capybara stands here. */
  const capyState = { x: -0.2 * window.innerWidth, y: window.innerHeight * 0.86, facing: 1 };

  /**
   * Every print on the floor. `dirt` runs 1 → 0 as it is scrubbed, `wetness`
   * is how dark it landed, and `resistance` is how much work it takes.
   *
   * @type {{
   *   element: HTMLElement,
   *   x: number,
   *   y: number,
   *   radius: number,
   *   dirt: number,
   *   wetness: number,
   *   resistance: number,
   * }[]}
   */
  const prints = [];

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

  /**
   * The mud is clipped to the sprite's own alpha, so painting it before the
   * artwork has decoded leaves a bare brown rectangle hanging in the page.
   *
   * @param {HTMLImageElement} image
   * @returns {Promise<void>}
   */
  function whenLoaded(image) {
    if (image.complete && image.naturalWidth > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      // A sprite that fails to load must not stall the punishment forever.
      image.addEventListener('error', () => resolve(), { once: true });
    });
  }

  function capyHeight() {
    // Floored like arepa-rain: a 0-height tab would otherwise collapse the
    // animal to nothing and leave nothing to look at.
    return Math.max(240, window.innerHeight) * (CAPY_HEIGHT_VH / 100);
  }

  function layout() {
    const height = capyHeight();
    const aspect = phase === 'smug' ? SMUG_ASPECT : WALK_ASPECT;
    capy.style.setProperty('--page-pause-capy-h', `${height}px`);
    capy.style.setProperty('--page-pause-capy-w', `${height * aspect}px`);
  }

  function place() {
    capy.style.setProperty('--page-pause-capy-x', `${capyState.x.toFixed(1)}px`);
    capy.style.setProperty('--page-pause-capy-y', `${capyState.y.toFixed(1)}px`);
    // The walk sprite is drawn facing right, so travelling left means a flip.
    capy.classList.toggle('page-pause-capy-flipped', capyState.facing < 0);
  }

  /**
   * The area the feet may reach — which is the area that ends up muddy, so it
   * is as close to the whole page as the artwork allows.
   *
   * The top line is set at 45% of the animal's height rather than a full body
   * length below the edge: the last rows walk with the head cropped off the top
   * of the viewport, which covers the top of the page and looks like a
   * capybara squeezing along the ceiling. Clearing it entirely would leave a
   * body-height band of the page permanently clean.
   */
  function bounds() {
    const width = capyHeight() * WALK_ASPECT;
    const margin = width * 0.5 + 8;

    return {
      minX: margin,
      maxX: Math.max(margin + 1, window.innerWidth - margin),
      minY: Math.min(window.innerHeight * 0.5, Math.max(window.innerHeight * 0.05, capyHeight() * 0.45)),
      maxY: window.innerHeight * 0.96,
    };
  }

  /**
   * Solve the route for this viewport: how many crossings, how far apart the
   * footfalls, and how fast it has to move to finish in ROUTE_TARGET_MS.
   *
   * @param {number} [rows] Overrides the derived row count (used by the retry).
   * @returns {{ lines: number[], speed: number, stride: number }}
   */
  function planRoute(rows) {
    const area = bounds();
    const span = Math.max(0, area.maxY - area.minY);
    const crossing = area.maxX - area.minX;
    const rowCount = rows ?? Math.min(ROW_MAX, Math.max(ROW_MIN, Math.round(span / ROW_GAP_PX)));

    // Bottom row first, then up. With one row there is nothing to space out.
    // Each line is knocked off its exact position so the finished page is not
    // ruled like a notebook — the gap between two rows varies by roughly half
    // a row either way, which is enough to lose the grid without opening bald
    // stripes across the page.
    const jitter = ROW_GAP_PX * ROW_JITTER_FRACTION;
    const lines = [];

    for (let index = 0; index < rowCount; index += 1) {
      const line = area.maxY - (rowCount < 2 ? 0 : (span * index) / (rowCount - 1));
      const nudged = line + (index === 0 ? 0 : randomBetween(-jitter, jitter));

      lines.push(Math.min(area.maxY, Math.max(area.minY, nudged)));
    }

    // Crossings plus the climb between them: everything the feet will cover.
    const distance = crossing * rowCount + span;

    // One stand-around per row, at the turn. That time is not walking time, so
    // it comes out of the budget before speed is solved.
    const pauseMs = rowCount * ((TURN_PAUSE_MIN_MS + TURN_PAUSE_MAX_MS) / 2);
    const walkingMs = Math.max(ROUTE_TARGET_MS * 0.4, ROUTE_TARGET_MS - pauseMs);

    return {
      lines,
      speed: Math.min(WALK_SPEED_MAX, Math.max(WALK_SPEED_MIN, distance / (walkingMs / 1_000))),
      // Prints are spaced off the animal, then stretched if that many prints
      // would overrun the budget — a 4K page must not cost 2,000 elements.
      stride: Math.max(capyHeight() * WALK_ASPECT * STRIDE_FRACTION, distance / PRINT_BUDGET),
    };
  }

  /* --- The capybara's own filth ------------------------------------------
     Painted once and never scrubbed. It is not the chore; it is the excuse
     for the chore, and it has to look like the source of what is on the floor. */

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
    const sprite = phase === 'smug' ? spriteSmug : spriteWalk;

    // No artwork, no silhouette to clip to — see whenLoaded.
    if (rect.width < 2 || rect.height < 2 || sprite.naturalWidth === 0) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;

    mud.width = Math.max(1, Math.round(rect.width * ratio));
    mud.height = Math.max(1, Math.round(rect.height * ratio));
    canvas.setTransform(ratio, 0, 0, ratio, 0, 0);
    canvas.clearRect(0, 0, rect.width, rect.height);
    canvas.globalCompositeOperation = 'source-over';
    canvas.globalAlpha = 1;

    // Only the feet are dirty. It has been walking through mud, not rolling in
    // it, so the muck stops at the ankles and everything above stays clean.
    const mudLine = rect.height * (1 - MUD_COVERAGE);
    // The wash fades in above the line instead of starting at full strength, so
    // there is no tidemark across the legs.
    const feather = rect.height * MUD_COVERAGE * 0.6;

    const coat = canvas.createLinearGradient(0, mudLine - feather, 0, rect.height);
    coat.addColorStop(0, 'rgba(74, 61, 44, 0)');
    coat.addColorStop(0.45, 'rgba(70, 58, 42, 0.5)');
    coat.addColorStop(1, 'rgba(54, 44, 32, 0.85)');
    canvas.fillStyle = coat;
    canvas.fillRect(0, mudLine - feather, rect.width, rect.height - mudLine + feather);

    // Mottling, at low alpha. These only break up the flat wash — at full
    // strength they were shapes you noticed rather than dirt. Sized off the
    // muddy band rather than the whole animal, or a single splat would cover
    // every foot at once.
    for (let index = 0; index < 14; index += 1) {
      splat(
        randomBetween(0, rect.width),
        randomBetween(mudLine - feather * 0.5, rect.height),
        randomBetween(rect.width * 0.04, rect.width * 0.1),
        MUD_TONES[index % MUD_TONES.length],
        randomBetween(0.18, 0.36),
      );
    }

    // Short drips off the legs: the streaks are what tells the eye this is wet
    // dirt rather than a shadow under the animal.
    for (let index = 0; index < 6; index += 1) {
      const x = randomBetween(rect.width * 0.12, rect.width * 0.88);
      const y = randomBetween(mudLine - feather * 0.4, rect.height * 0.94);
      const length = randomBetween(rect.height * 0.02, rect.height * 0.05);
      const width = randomBetween(rect.width * 0.01, rect.width * 0.026);

      canvas.fillStyle = `rgba(84, 70, 50, ${randomBetween(0.45, 0.68).toFixed(2)})`;
      canvas.beginPath();
      canvas.ellipse(x, y + length / 2, width, length / 2, 0, 0, Math.PI * 2);
      canvas.fill();
      // The bead of mud that collects at the bottom of a run.
      splat(x, y + length, width * 1.6, MUD_TONES[0], randomBetween(0.5, 0.7));
    }

    // Spray: fine flecks kicked up its own legs, thinning out with height.
    for (let index = 0; index < 70; index += 1) {
      const size = randomBetween(1.2, 4);
      // Squared, so most flecks land near the feet and only a few make it up
      // past the muddy band.
      const height = Math.pow(Math.random(), 2);

      canvas.fillStyle = `rgba(70, 58, 42, ${randomBetween(0.3, 0.6).toFixed(2)})`;
      canvas.beginPath();
      canvas.ellipse(
        randomBetween(0, rect.width),
        rect.height - height * (rect.height - mudLine + feather * 1.6),
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
    canvas.globalCompositeOperation = 'destination-in';
    canvas.drawImage(sprite, 0, 0, rect.width, rect.height);
    canvas.globalCompositeOperation = 'source-over';
  }

  /* --- The floor, which is the actual chore ------------------------------- */

  function updateHud() {
    if (phase !== 'cleaning') {
      // No number to give yet — it is still deciding how bad this will be.
      count.textContent = 'Wait. It has not finished.';
      progress.classList.add('page-pause-capy-hidden');
      return;
    }

    progress.classList.remove('page-pause-capy-hidden');
    count.textContent = `${cleaned} / ${dropped} footprints scrubbed`;
    progressFill.style.setProperty(
      'width',
      `${dropped === 0 ? 100 : (cleaned / dropped) * 100}%`,
      'important',
    );
  }

  /**
   * Stamp one print at the feet. `angle` is the direction of travel, so the
   * toes point the way the animal is going.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} angle
   */
  function dropPrint(x, y, angle) {
    const element = document.createElement('span');
    // Size varies per print: identical stamps repeated 400 times read as
    // wallpaper, and no foot lands the same way twice.
    const width = capyHeight() * WALK_ASPECT * 0.21 * randomBetween(0.82, 1.18);
    // Left and right feet land either side of the line it is walking along.
    const side = (footIndex += 1) % 2 === 0 ? 1 : -1;
    const spread = width * randomBetween(0.42, 0.7) * side;
    const scatter = width * 0.22;
    const printX = x + Math.cos(angle + Math.PI / 2) * spread + randomBetween(-scatter, scatter);
    const printY =
      y + Math.sin(angle + Math.PI / 2) * spread * 0.4 + randomBetween(-scatter, scatter);

    element.className = 'page-pause-capy-print';
    element.style.setProperty('width', `${width}px`, 'important');
    element.style.setProperty('height', `${width * randomBetween(0.82, 1)}px`, 'important');
    element.style.setProperty('left', `${printX}px`, 'important');
    element.style.setProperty('top', `${printY}px`, 'important');
    element.style.setProperty(
      '--page-pause-print-r',
      // The sprite is seen from the side, so prints are flattened rather than
      // drawn in true top-down perspective; the rotation is subtle by design.
      `${(angle * 180) / Math.PI + 90 + randomBetween(-18, 18)}deg`,
      'important',
    );
    // Some feet come down wetter than others. Kept on the record as well as on
    // the element, so scrubbing fades from where this print actually started
    // instead of snapping it to full darkness on the first stroke.
    const wetness = randomBetween(0.72, 1);

    element.style.setProperty('opacity', wetness.toFixed(2), 'important');
    floor.append(element);
    prints.push({
      element,
      x: printX,
      y: printY,
      radius: width * 0.5,
      dirt: 1,
      wetness,
      resistance: randomBetween(SCRUB_RESISTANCE_MIN, SCRUB_RESISTANCE_MAX),
    });
    dropped += 1;

    // Over the ceiling the oldest prints dry up and are forgotten — they leave
    // the count with them, so the total still describes what is on the floor.
    while (prints.length > MAX_LIVE_PRINTS) {
      const oldest = prints.shift();
      oldest?.element.remove();
      dropped -= 1;
    }
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {number} stroke How far the sponge moved to get here, in px.
   */
  function scrubAt(clientX, clientY, stroke) {
    const lifted = Math.min(stroke, SCRUB_STEP_CAP_PX) * SCRUB_PER_PX;
    let scrubbed = false;

    if (lifted <= 0) {
      return;
    }

    for (let index = prints.length - 1; index >= 0; index -= 1) {
      const print = prints[index];
      const distanceX = clientX - print.x;
      const distanceY = clientY - print.y;

      if (Math.hypot(distanceX, distanceY) > SCRUB_RADIUS + print.radius) {
        continue;
      }

      print.dirt -= lifted / print.resistance;
      scrubbed = true;

      if (print.dirt <= 0) {
        print.element.remove();
        prints.splice(index, 1);
        cleaned += 1;
        updateHud();
        continue;
      }

      print.element.style.setProperty(
        'opacity',
        (print.dirt * print.wetness).toFixed(2),
        'important',
      );
      // Fading alone reads as a print sinking into the page; shrinking with it
      // reads as dirt being lifted off it.
      print.element.style.setProperty('--page-pause-print-s', (0.82 + print.dirt * 0.18).toFixed(3), 'important');
    }

    if (scrubbed) {
      spongeState.squish = 0.9;
      if (Math.random() < 0.35) spawnBubble(clientX, clientY);
    }
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

  /* --- Sponge ------------------------------------------------------------- */

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

      const ground = spongeFloor();

      if (spongeState.y >= ground) {
        spongeState.y = ground;

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

  /* --- Walking ------------------------------------------------------------ */

  /**
   * Plod to a point, stamping a print every stride. Resolves on arrival; the
   * caller decides where to go next and how long to dawdle.
   *
   * @param {number} targetX
   * @param {number} targetY
   * @param {boolean} leavesPrints
   * @param {number} [speed] px/s; defaults to the pace planRoute solved for.
   * @returns {Promise<void>}
   */
  function walkTo(targetX, targetY, leavesPrints, speed = route.speed) {
    return new Promise((resolve, reject) => {
      const startX = capyState.x;
      const startY = capyState.y;
      const distance = Math.hypot(targetX - startX, targetY - startY);
      const angle = Math.atan2(targetY - startY, targetX - startX);

      if (distance < 1) {
        return resolve();
      }

      // Turning is only meaningful on horizontal travel: the shuffle up onto
      // the next row would otherwise snap it back to facing right mid-route.
      if (Math.abs(targetX - startX) > 1) {
        capyState.facing = targetX > startX ? 1 : -1;
      }
      capy.classList.add('page-pause-capy-walking');

      let last = performance.now();
      let travelled = 0;
      let nextPrint = route.stride * 0.4;

      const frame = (now) => {
        if (!running) {
          return reject(new Error('cancelled'));
        }

        travelled = Math.min(distance, travelled + speed * Math.min(0.05, (now - last) / 1_000));
        last = now;

        capyState.x = startX + Math.cos(angle) * travelled;
        capyState.y = startY + Math.sin(angle) * travelled;
        place();

        if (leavesPrints && travelled >= nextPrint) {
          dropPrint(capyState.x, capyState.y, angle);
          nextPrint += route.stride;
        }

        if (travelled < distance) {
          window.requestAnimationFrame(frame);
        } else {
          capy.classList.remove('page-pause-capy-walking');
          resolve();
        }
      };

      window.requestAnimationFrame(frame);
    });
  }

  /**
   * One full crossing, unbroken, but not in a straight line: the row is walked
   * as a handful of segments that drift above and below its line and change
   * pace between them. It arrives exactly on `targetX` — the wander is in the
   * middle, not at the ends, so rows still alternate cleanly.
   *
   * @param {number} targetX
   * @param {number} y
   * @returns {Promise<void>}
   */
  async function walkRow(targetX, y) {
    const area = bounds();
    const startX = capyState.x;
    const drift = ROW_GAP_PX * ROW_DRIFT_FRACTION;
    const segments = Math.round(randomBetween(ROW_SEGMENTS_MIN, ROW_SEGMENTS_MAX));

    for (let index = 1; index <= segments; index += 1) {
      const last = index === segments;
      // Waypoints are spaced unevenly along the crossing, so the drift does not
      // come out as a regular wave.
      const progressed = index / segments + (last ? 0 : randomBetween(-0.09, 0.09));
      const x = last ? targetX : startX + (targetX - startX) * progressed;
      const segmentY = last
        ? y
        : Math.min(area.maxY, Math.max(area.minY, y + randomBetween(-drift, drift)));

      await walkTo(
        x,
        segmentY,
        true,
        route.speed * randomBetween(1 - SPEED_JITTER, 1 + SPEED_JITTER),
      );
    }
  }

  /** @param {'walk' | 'smug'} which */
  function showSprite(which) {
    spriteWalk.classList.toggle('page-pause-capy-hidden', which !== 'walk');
    spriteSmug.classList.toggle('page-pause-capy-hidden', which !== 'smug');
  }

  /* --- Input -------------------------------------------------------------- */

  // Picking the sponge up is the sponge's own job — the element is only
  // clickable once it has come to rest, so no manual hit testing is needed.
  sponge.addEventListener('pointerdown', (event) => {
    if (!spongeState.active || spongeState.held) {
      return;
    }

    event.preventDefault();
    spongeState.held = true;
    spongeState.velocityX = 0;
    spongeState.velocityY = 0;
    spongeState.spin = 0;
    spongeState.x = event.clientX;
    spongeState.y = event.clientY;
    sponge.classList.remove('page-pause-capy-pickable');
    overlay.classList.add('page-pause-capy-holding');
  });

  overlay.addEventListener('pointermove', (event) => {
    if (!spongeState.held) {
      return;
    }

    // Dirt lifts per pixel travelled, so the stroke has to be measured from the
    // sponge's last position before it is moved.
    const stroke = Math.hypot(event.clientX - spongeState.x, event.clientY - spongeState.y);

    spongeState.x = event.clientX;
    spongeState.y = event.clientY;
    // In hand, contact is the scrub — there is no second button to hold down.
    scrubAt(event.clientX, event.clientY, stroke);
  });

  // A scrub stroke is a drag, and the host page would otherwise try to turn it
  // into a native image or text drag.
  overlay.addEventListener('dragstart', (event) => event.preventDefault());

  /* --- Blocking the page -------------------------------------------------
     With the dimming gone, the overlay is invisible, so it has to do the whole
     job of holding the page hostage on its own. Clicks it already eats by
     covering everything; these three cover the ways input gets past a
     transparent element. */

  // Scrolling would otherwise pass straight through to the page underneath,
  // and the prints are fixed to the viewport — the mess would slide off the
  // content it is supposedly sitting on.
  overlay.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
  overlay.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });

  // Keys reach the page regardless of what is on top of it: space and the
  // arrows scroll, and anything focused before the punishment landed is still
  // typeable. Captured before the page sees them. Modifier combos are left
  // alone so the browser's own shortcuts — closing the tab included — work.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  window.addEventListener('resize', () => {
    const area = bounds();
    capyState.x = Math.min(area.maxX, Math.max(area.minX, capyState.x));
    capyState.y = Math.min(area.maxY, Math.max(area.minY, capyState.y));
    layout();
    place();
    paintMud();

    // A print left outside a shrunken window can never be reached, and the
    // floor only comes clean when every one of them is gone — so they are
    // dragged back inside rather than abandoned.
    for (const print of prints) {
      print.x = Math.min(window.innerWidth - print.radius, Math.max(print.radius, print.x));
      print.y = Math.min(window.innerHeight - print.radius, Math.max(print.radius, print.y));
      print.element.style.setProperty('left', `${print.x}px`, 'important');
      print.element.style.setProperty('top', `${print.y}px`, 'important');
    }
  });

  /** Resolves once every print on the floor has been scrubbed off. */
  function waitForClean() {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!running) {
          return reject(new Error('cancelled'));
        }

        if (prints.length === 0) {
          return resolve();
        }

        window.requestAnimationFrame(check);
      };

      window.requestAnimationFrame(check);
    });
  }

  /**
   * Walk the route: bottom row to top, one full crossing each, alternating
   * sides. This is the half where you are a spectator.
   *
   * @param {number[]} lines Row positions, in the order they are walked.
   */
  async function trackUpThePage(lines) {
    const area = bounds();

    for (let index = 0; index < lines.length; index += 1) {
      const y = lines[index];

      // Shuffle up onto the new row before setting off across it, so the turn
      // happens at the edge where it belongs.
      if (Math.abs(y - capyState.y) > 1) {
        await walkTo(capyState.x, y, true);
      }

      // Alternating ends: each row starts where the last one finished. It
      // stops somewhere short of the edge rather than exactly on it, so the
      // two sides of the page do not end up with a ruled margin.
      const slack = (area.maxX - area.minX) * ROW_END_SLACK;

      await walkRow(
        capyState.x < window.innerWidth * 0.5
          ? area.maxX - randomBetween(0, slack)
          : area.minX + randomBetween(0, slack),
        y,
      );
      await sleep(randomBetween(TURN_PAUSE_MIN_MS, TURN_PAUSE_MAX_MS));
    }
  }

  /**
   * Off the nearest side, at a pace that does not make you wait for it. No
   * prints on the way out: a print stamped off the edge of the viewport can
   * never be scrubbed, and the floor would never come clean.
   */
  async function walkOut() {
    const area = bounds();
    const exitX = capyState.x > window.innerWidth * 0.5
      ? window.innerWidth + area.minX
      : -area.minX;

    await walkTo(exitX, capyState.y, false, ENTRANCE_SPEED);
  }

  /* --- Score ------------------------------------------------------------- */

  async function play() {
    // 1 — plod in from the left, filthy, already making a mess.
    phase = 'walk-in';
    layout();
    showSprite('walk');
    capyState.y = bounds().maxY;
    capyState.x = -capyHeight() * WALK_ASPECT;
    place();
    await whenLoaded(spriteWalk);
    paintMud();
    hud.classList.add('page-pause-capy-visible');
    updateHud();
    await walkTo(bounds().minX, capyState.y, true, ENTRANCE_SPEED);

    // 2 — turn, face you, look extremely pleased with what it is about to do.
    phase = 'smug';
    layout();
    showSprite('smug');
    place();
    await whenLoaded(spriteSmug);
    paintMud();
    capy.classList.add('page-pause-capy-smug');
    await sleep(SMUG_STARE_MS);

    // 3 — mow the page, row by row. No sponge exists yet; there is nothing to
    // do here but watch it fill the page in.
    phase = 'tracking';
    capy.classList.remove('page-pause-capy-smug');
    showSprite('walk');
    layout();
    paintMud();
    route = planRoute();
    await trackUpThePage(route.lines);

    for (;;) {
      // 4 — finished, and it leaves without a backward glance.
      phase = 'leaving';
      await walkOut();

      // 5 — only now does the sponge turn up, with the whole route waiting.
      phase = 'cleaning';
      updateHud();
      dropSponge();
      await waitForClean();

      hideSponge();
      hud.classList.remove('page-pause-capy-visible');

      try {
        await context.grantPass();
        return;
      } catch {
        // grantPass never resolves on success — the page navigates away.
        // Getting here means it failed, so the capybara comes back and does
        // another crossing rather than leaving the page stuck with no way out.
        phase = 'tracking';
        hud.classList.add('page-pause-capy-visible');
        updateHud();
        capyState.x = capyState.x > window.innerWidth * 0.5
          ? window.innerWidth + capyHeight() * WALK_ASPECT
          : -capyHeight() * WALK_ASPECT;
        place();
        route = planRoute(RETRY_ROWS);
        await walkTo(
          capyState.x > 0 ? bounds().maxX : bounds().minX,
          bounds().maxY,
          true,
          ENTRANCE_SPEED,
        );
        await trackUpThePage(route.lines);
      }
    }
  }

  void play().catch(() => {
    // Cancellation only — nothing sets `running` false today, but a rejected
    // walk must not surface as an unhandled rejection on the host page.
  });
}

/** @type {import('./registry.js').Punishment} */
export const capybaraTracks = {
  id: 'capybara-tracks',
  label: 'Capybara tracks',
  color: '#a9652b',
  textColor: '#ffe6c2',
  taunt: 'Something filthy is waddling onto your page…',
  mount,
};
