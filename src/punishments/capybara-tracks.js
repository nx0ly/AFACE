const WALK_ASPECT = 872 / 1156;
const SMUG_ASPECT = 1194 / 1566;

const CAPY_HEIGHT_VH = 20;

const ROW_GAP_PX = 30;
const ROW_JITTER_FRACTION = 0.45;
const ROW_DRIFT_FRACTION = 0.5;
const ROW_SEGMENTS_MIN = 3;
const ROW_SEGMENTS_MAX = 6;
const ROW_END_SLACK = 0.08;
const SPEED_JITTER = 0.18;
const ROW_MIN = 12;
const ROW_MAX = 34;

const ROUTE_TARGET_MS = 80_000;
const WALK_SPEED_MIN = 200;
const WALK_SPEED_MAX = 900;

const ENTRANCE_SPEED = 400;

const TURN_PAUSE_MIN_MS = 260;
const TURN_PAUSE_MAX_MS = 620;

const SMUG_STARE_MS = 1_800;

const STRIDE_FRACTION = 0.4;
const PRINT_BUDGET = 720;
const MAX_LIVE_PRINTS = 1_100;

const RETRY_ROWS = 2;

const SCRUB_RADIUS = 52;

const SCRUB_PER_PX = 0.0022;
const SCRUB_STEP_CAP_PX = 40;
const SCRUB_RESISTANCE_MIN = 0.85;
const SCRUB_RESISTANCE_MAX = 1.85;

const SPONGE_GRAVITY = 2_600;
const SPONGE_RESTITUTION = 0.42;
const SPONGE_FRICTION = 0.78;
const SPONGE_REST_ANGLE = -8;

const MUD_COVERAGE = 0.15;

const MUD_TONES = [
  [78, 64, 46],
  [96, 82, 62],
  [64, 53, 39],
  [110, 96, 74],
];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function mount(context) {
  if (!document.body || document.querySelector(".page-pause-capy-overlay")) {
    return;
  }

  const overlay = document.createElement("div");
  const floor = document.createElement("div");
  const capy = document.createElement("div");
  const body = document.createElement("div");
  const shadow = document.createElement("div");
  const spriteWalk = document.createElement("img");
  const spriteSmug = document.createElement("img");
  const mud = document.createElement("canvas");
  const sponge = document.createElement("img");
  const hud = document.createElement("div");
  const count = document.createElement("div");
  const progress = document.createElement("div");
  const progressFill = document.createElement("div");

  overlay.className = "page-pause-capy-overlay";
  floor.className = "page-pause-capy-floor";
  capy.className = "page-pause-capy";
  body.className = "page-pause-capy-body";
  shadow.className = "page-pause-capy-shadow";
  spriteWalk.className = "page-pause-capy-sprite page-pause-capy-sprite-walk";
  spriteSmug.className =
    "page-pause-capy-sprite page-pause-capy-sprite-smug page-pause-capy-hidden";
  mud.className = "page-pause-capy-mud";
  sponge.className = "page-pause-capy-sponge";
  hud.className = "page-pause-capy-hud";
  count.className = "page-pause-capy-count";
  progress.className = "page-pause-capy-progress";
  progressFill.className = "page-pause-capy-progress-fill";

  spriteWalk.src = context.getAssetUrl("images/capybara/walk.png");
  spriteSmug.src = context.getAssetUrl("images/capybara/smug.png");
  sponge.src = context.getAssetUrl("images/capybara/sponge.png");

  for (const image of [spriteWalk, spriteSmug, sponge]) {
    image.draggable = false;
    image.alt = "";
  }

  body.append(spriteWalk, spriteSmug, mud);
  capy.append(shadow, body);
  progress.append(progressFill);
  hud.append(count, progress);
  overlay.append(floor, capy, sponge, hud);
  document.body.append(overlay);

  const canvas = mud.getContext("2d");

  if (!canvas) {
    overlay.remove();
    return;
  }

  let phase = "idle";
  let running = true;
  let footIndex = 0;

  let dropped = 0;
  let cleaned = 0;
  let spongeFrame = 0;
  let spongeLast = 0;

  let route = planRoute();

  const capyState = {
    x: -0.2 * window.innerWidth,
    y: window.innerHeight * 0.86,
    facing: 1,
  };

  const prints = [];

  const spongeState = {
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    rotation: 0,
    spin: 0,
    squish: 1,
    held: false,
    landed: false,
    active: false,
  };

  const sleep = (ms) =>
    new Promise((resolve, reject) => {
      window.setTimeout(
        () => (running ? resolve() : reject(new Error("cancelled"))),
        ms,
      );
    });

  function whenLoaded(image) {
    if (image.complete && image.naturalWidth > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }

  function capyHeight() {
    return Math.max(240, window.innerHeight) * (CAPY_HEIGHT_VH / 100);
  }

  function layout() {
    const height = capyHeight();
    const aspect = phase === "smug" ? SMUG_ASPECT : WALK_ASPECT;
    capy.style.setProperty("--page-pause-capy-h", `${height}px`);
    capy.style.setProperty("--page-pause-capy-w", `${height * aspect}px`);
  }

  function place() {
    capy.style.setProperty(
      "--page-pause-capy-x",
      `${capyState.x.toFixed(1)}px`,
    );
    capy.style.setProperty(
      "--page-pause-capy-y",
      `${capyState.y.toFixed(1)}px`,
    );

    capy.classList.toggle("page-pause-capy-flipped", capyState.facing < 0);
  }

  function bounds() {
    const width = capyHeight() * WALK_ASPECT;
    const margin = width * 0.5 + 8;

    return {
      minX: margin,
      maxX: Math.max(margin + 1, window.innerWidth - margin),
      minY: Math.min(
        window.innerHeight * 0.5,
        Math.max(window.innerHeight * 0.05, capyHeight() * 0.45),
      ),
      maxY: window.innerHeight * 0.96,
    };
  }

  function planRoute(rows) {
    const area = bounds();
    const span = Math.max(0, area.maxY - area.minY);
    const crossing = area.maxX - area.minX;
    const rowCount =
      rows ??
      Math.min(ROW_MAX, Math.max(ROW_MIN, Math.round(span / ROW_GAP_PX)));

    const jitter = ROW_GAP_PX * ROW_JITTER_FRACTION;
    const lines = [];

    for (let index = 0; index < rowCount; index += 1) {
      const line =
        area.maxY - (rowCount < 2 ? 0 : (span * index) / (rowCount - 1));
      const nudged = line + (index === 0 ? 0 : randomBetween(-jitter, jitter));

      lines.push(Math.min(area.maxY, Math.max(area.minY, nudged)));
    }

    const distance = crossing * rowCount + span;
    const pauseMs = rowCount * ((TURN_PAUSE_MIN_MS + TURN_PAUSE_MAX_MS) / 2);
    const walkingMs = Math.max(
      ROUTE_TARGET_MS * 0.4,
      ROUTE_TARGET_MS - pauseMs,
    );

    return {
      lines,
      speed: Math.min(
        WALK_SPEED_MAX,
        Math.max(WALK_SPEED_MIN, distance / (walkingMs / 1_000)),
      ),
      stride: Math.max(
        capyHeight() * WALK_ASPECT * STRIDE_FRACTION,
        distance / PRINT_BUDGET,
      ),
    };
  }

  function splat(x, y, radius, tone, alpha) {
    const points = Math.round(randomBetween(8, 13));
    const [red, green, blue] = tone;
    const vertices = [];

    for (let index = 0; index < points; index += 1) {
      const angle = (index / points) * Math.PI * 2;
      const reach = radius * randomBetween(0.55, 1.35);

      vertices.push({
        x: x + Math.cos(angle) * reach,
        y: y + Math.sin(angle) * reach * 0.8,
      });
    }

    canvas.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(2)})`;
    canvas.beginPath();
    canvas.moveTo(
      (vertices[points - 1].x + vertices[0].x) / 2,
      (vertices[points - 1].y + vertices[0].y) / 2,
    );

    for (let index = 0; index < points; index += 1) {
      const current = vertices[index];
      const next = vertices[(index + 1) % points];

      canvas.quadraticCurveTo(
        current.x,
        current.y,
        (current.x + next.x) / 2,
        (current.y + next.y) / 2,
      );
    }

    canvas.closePath();
    canvas.fill();
  }

  function paintMud() {
    const rect = capy.getBoundingClientRect();
    const sprite = phase === "smug" ? spriteSmug : spriteWalk;

    if (rect.width < 2 || rect.height < 2 || sprite.naturalWidth === 0) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;

    mud.width = Math.max(1, Math.round(rect.width * ratio));
    mud.height = Math.max(1, Math.round(rect.height * ratio));
    canvas.setTransform(ratio, 0, 0, ratio, 0, 0);
    canvas.clearRect(0, 0, rect.width, rect.height);
    canvas.globalCompositeOperation = "source-over";
    canvas.globalAlpha = 1;

    const mudLine = rect.height * (1 - MUD_COVERAGE);
    const feather = rect.height * MUD_COVERAGE * 0.6;

    const coat = canvas.createLinearGradient(
      0,
      mudLine - feather,
      0,
      rect.height,
    );

    coat.addColorStop(0, "rgba(74, 61, 44, 0)");
    coat.addColorStop(0.45, "rgba(70, 58, 42, 0.5)");
    coat.addColorStop(1, "rgba(54, 44, 32, 0.85)");

    canvas.fillStyle = coat;
    canvas.fillRect(
      0,
      mudLine - feather,
      rect.width,
      rect.height - mudLine + feather,
    );

    for (let index = 0; index < 14; index += 1) {
      splat(
        randomBetween(0, rect.width),
        randomBetween(mudLine - feather * 0.5, rect.height),
        randomBetween(rect.width * 0.04, rect.width * 0.1),
        MUD_TONES[index % MUD_TONES.length],
        randomBetween(0.18, 0.36),
      );
    }

    for (let index = 0; index < 6; index += 1) {
      const x = randomBetween(rect.width * 0.12, rect.width * 0.88);
      const y = randomBetween(mudLine - feather * 0.4, rect.height * 0.94);
      const length = randomBetween(rect.height * 0.02, rect.height * 0.05);
      const width = randomBetween(rect.width * 0.01, rect.width * 0.026);

      canvas.fillStyle = `rgba(84, 70, 50, ${randomBetween(0.45, 0.68).toFixed(2)})`;
      canvas.beginPath();
      canvas.ellipse(x, y + length / 2, width, length / 2, 0, 0, Math.PI * 2);
      canvas.fill();

      splat(x, y + length, width * 1.6, MUD_TONES[0], randomBetween(0.5, 0.7));
    }

    for (let index = 0; index < 70; index += 1) {
      const size = randomBetween(1.2, 4);
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

    canvas.globalCompositeOperation = "destination-in";
    canvas.drawImage(sprite, 0, 0, rect.width, rect.height);
    canvas.globalCompositeOperation = "source-over";
  }

  function updateHud() {
    if (phase !== "cleaning") {
      count.textContent = "Wait. It has not finished.";
      progress.classList.add("page-pause-capy-hidden");
      return;
    }

    progress.classList.remove("page-pause-capy-hidden");
    count.textContent = `${cleaned} / ${dropped} footprints scrubbed`;

    progressFill.style.setProperty(
      "width",
      `${dropped === 0 ? 100 : (cleaned / dropped) * 100}%`,
      "important",
    );
  }

  function dropPrint(x, y, angle) {
    const element = document.createElement("span");
    const width = capyHeight() * WALK_ASPECT * 0.21 * randomBetween(0.82, 1.18);

    const side = (footIndex += 1) % 2 === 0 ? 1 : -1;
    const spread = width * randomBetween(0.42, 0.7) * side;
    const scatter = width * 0.22;

    const printX =
      x +
      Math.cos(angle + Math.PI / 2) * spread +
      randomBetween(-scatter, scatter);

    const printY =
      y +
      Math.sin(angle + Math.PI / 2) * spread * 0.4 +
      randomBetween(-scatter, scatter);

    element.className = "page-pause-capy-print";
    element.style.setProperty("width", `${width}px`, "important");
    element.style.setProperty(
      "height",
      `${width * randomBetween(0.82, 1)}px`,
      "important",
    );
    element.style.setProperty("left", `${printX}px`, "important");
    element.style.setProperty("top", `${printY}px`, "important");
    element.style.setProperty(
      "--page-pause-print-r",
      `${(angle * 180) / Math.PI + 90 + randomBetween(-18, 18)}deg`,
      "important",
    );

    const wetness = randomBetween(0.72, 1);

    element.style.setProperty("opacity", wetness.toFixed(2), "important");
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

    while (prints.length > MAX_LIVE_PRINTS) {
      const oldest = prints.shift();
      oldest?.element.remove();
      dropped -= 1;
    }
  }

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
        "opacity",
        (print.dirt * print.wetness).toFixed(2),
        "important",
      );

      print.element.style.setProperty(
        "--page-pause-print-s",
        (0.82 + print.dirt * 0.18).toFixed(3),
        "important",
      );
    }

    if (scrubbed) {
      spongeState.squish = 0.9;
      if (Math.random() < 0.35) {
        spawnBubble(clientX, clientY);
      }
    }
  }

  function spawnBubble(clientX, clientY) {
    const bubble = document.createElement("span");
    const size = randomBetween(10, 26);

    bubble.className = "page-pause-capy-bubble";
    bubble.style.setProperty("width", `${size}px`, "important");
    bubble.style.setProperty("height", `${size}px`, "important");
    bubble.style.setProperty(
      "left",
      `${clientX + randomBetween(-30, 30)}px`,
      "important",
    );
    bubble.style.setProperty(
      "top",
      `${clientY + randomBetween(-20, 20)}px`,
      "important",
    );

    bubble.addEventListener("animationend", () => bubble.remove(), {
      once: true,
    });

    overlay.append(bubble);
  }

  function spongeFloor() {
    return window.innerHeight * 0.94 - sponge.offsetHeight * 0.3;
  }

  function renderSponge() {
    sponge.style.setProperty(
      "transform",
      `translate3d(${spongeState.x}px, ${spongeState.y}px, 0) translate(-50%, -50%)` +
        ` rotate(${spongeState.rotation.toFixed(1)}deg)` +
        ` scale(${(2 - spongeState.squish).toFixed(3)}, ${spongeState.squish.toFixed(3)})`,
      "important",
    );
  }

  function stepSponge(now) {
    if (!spongeState.active || !running) {
      return;
    }

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
          spongeState.squish = 0.78;
          spongeState.spin *= -0.45;
        } else {
          spongeState.velocityY = 0;
          spongeState.landed = true;
        }

        spongeState.velocityX *= SPONGE_FRICTION;
        spongeState.spin *= SPONGE_FRICTION;
      }

      const margin = sponge.offsetWidth * 0.5;

      if (spongeState.x < margin) {
        spongeState.x = margin;
        spongeState.velocityX = Math.abs(spongeState.velocityX) * 0.4;
      } else if (spongeState.x > window.innerWidth - margin) {
        spongeState.x = window.innerWidth - margin;
        spongeState.velocityX = -Math.abs(spongeState.velocityX) * 0.4;
      }

      if (spongeState.landed) {
        spongeState.rotation +=
          (SPONGE_REST_ANGLE - spongeState.rotation) * Math.min(1, delta * 7);

        spongeState.spin = 0;
        sponge.classList.add("page-pause-capy-pickable");
      }
    }

    spongeState.squish += (1 - spongeState.squish) * Math.min(1, delta * 9);

    renderSponge();
    spongeFrame = window.requestAnimationFrame(stepSponge);
  }

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

    sponge.classList.add("page-pause-capy-visible");
    sponge.classList.remove("page-pause-capy-pickable");

    renderSponge();

    spongeLast = performance.now();
    window.cancelAnimationFrame(spongeFrame);
    spongeFrame = window.requestAnimationFrame(stepSponge);
  }

  function hideSponge() {
    spongeState.active = false;
    spongeState.held = false;
    window.cancelAnimationFrame(spongeFrame);

    sponge.classList.remove(
      "page-pause-capy-visible",
      "page-pause-capy-pickable",
    );

    overlay.classList.remove("page-pause-capy-holding");
  }

  function walkTo(targetX, targetY, leavesPrints, speed = route.speed) {
    return new Promise((resolve, reject) => {
      const startX = capyState.x;
      const startY = capyState.y;
      const distance = Math.hypot(targetX - startX, targetY - startY);
      const angle = Math.atan2(targetY - startY, targetX - startX);

      if (distance < 1) {
        return resolve();
      }

      if (Math.abs(targetX - startX) > 1) {
        capyState.facing = targetX > startX ? 1 : -1;
      }

      capy.classList.add("page-pause-capy-walking");

      let last = performance.now();
      let travelled = 0;
      let nextPrint = route.stride * 0.4;

      const frame = (now) => {
        if (!running) {
          return reject(new Error("cancelled"));
        }

        travelled = Math.min(
          distance,
          travelled + speed * Math.min(0.05, (now - last) / 1_000),
        );

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
          capy.classList.remove("page-pause-capy-walking");
          resolve();
        }
      };

      window.requestAnimationFrame(frame);
    });
  }

  async function walkRow(targetX, y) {
    const area = bounds();
    const startX = capyState.x;
    const drift = ROW_GAP_PX * ROW_DRIFT_FRACTION;

    const segments = Math.round(
      randomBetween(ROW_SEGMENTS_MIN, ROW_SEGMENTS_MAX),
    );

    for (let index = 1; index <= segments; index += 1) {
      const last = index === segments;

      const progressed =
        index / segments + (last ? 0 : randomBetween(-0.09, 0.09));

      const x = last ? targetX : startX + (targetX - startX) * progressed;

      const segmentY = last
        ? y
        : Math.min(
            area.maxY,
            Math.max(area.minY, y + randomBetween(-drift, drift)),
          );

      await walkTo(
        x,
        segmentY,
        true,
        route.speed * randomBetween(1 - SPEED_JITTER, 1 + SPEED_JITTER),
      );
    }
  }

  function showSprite(which) {
    spriteWalk.classList.toggle("page-pause-capy-hidden", which !== "walk");

    spriteSmug.classList.toggle("page-pause-capy-hidden", which !== "smug");
  }

  sponge.addEventListener("pointerdown", (event) => {
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

    sponge.classList.remove("page-pause-capy-pickable");
    overlay.classList.add("page-pause-capy-holding");
  });

  overlay.addEventListener("pointermove", (event) => {
    if (!spongeState.held) {
      return;
    }

    const stroke = Math.hypot(
      event.clientX - spongeState.x,
      event.clientY - spongeState.y,
    );

    spongeState.x = event.clientX;
    spongeState.y = event.clientY;

    scrubAt(event.clientX, event.clientY, stroke);
  });

  overlay.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });

  overlay.addEventListener("wheel", (event) => event.preventDefault(), {
    passive: false,
  });

  overlay.addEventListener("touchmove", (event) => event.preventDefault(), {
    passive: false,
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  window.addEventListener("resize", () => {
    const area = bounds();

    capyState.x = Math.min(area.maxX, Math.max(area.minX, capyState.x));

    capyState.y = Math.min(area.maxY, Math.max(area.minY, capyState.y));

    layout();
    place();
    paintMud();

    for (const print of prints) {
      print.x = Math.min(
        window.innerWidth - print.radius,
        Math.max(print.radius, print.x),
      );

      print.y = Math.min(
        window.innerHeight - print.radius,
        Math.max(print.radius, print.y),
      );

      print.element.style.setProperty("left", `${print.x}px`, "important");

      print.element.style.setProperty("top", `${print.y}px`, "important");
    }
  });

  function waitForClean() {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!running) {
          return reject(new Error("cancelled"));
        }

        if (prints.length === 0) {
          return resolve();
        }

        window.requestAnimationFrame(check);
      };

      window.requestAnimationFrame(check);
    });
  }

  async function trackUpThePage(lines) {
    const area = bounds();

    for (let index = 0; index < lines.length; index += 1) {
      const y = lines[index];

      if (Math.abs(y - capyState.y) > 1) {
        await walkTo(capyState.x, y, true);
      }

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

  async function walkOut() {
    const area = bounds();

    const exitX =
      capyState.x > window.innerWidth * 0.5
        ? window.innerWidth + area.minX
        : -area.minX;

    await walkTo(exitX, capyState.y, false, ENTRANCE_SPEED);
  }

  async function play() {
    phase = "walk-in";
    layout();
    showSprite("walk");

    capyState.y = bounds().maxY;
    capyState.x = -capyHeight() * WALK_ASPECT;

    place();

    await whenLoaded(spriteWalk);
    paintMud();

    hud.classList.add("page-pause-capy-visible");
    updateHud();

    await walkTo(bounds().minX, capyState.y, true, ENTRANCE_SPEED);

    phase = "smug";
    layout();
    showSprite("smug");
    place();

    await whenLoaded(spriteSmug);
    paintMud();

    capy.classList.add("page-pause-capy-smug");
    await sleep(SMUG_STARE_MS);

    phase = "tracking";
    capy.classList.remove("page-pause-capy-smug");
    showSprite("walk");
    layout();
    paintMud();

    route = planRoute();
    await trackUpThePage(route.lines);

    // ._.
    // js beauty!!!
    for (;;) {
      phase = "leaving";
      await walkOut();

      phase = "cleaning";
      updateHud();
      dropSponge();

      await waitForClean();

      hideSponge();
      hud.classList.remove("page-pause-capy-visible");

      try {
        await context.grantPass();
        return;
      } catch {
        phase = "tracking";
        hud.classList.add("page-pause-capy-visible");
        updateHud();

        capyState.x =
          capyState.x > window.innerWidth * 0.5
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

  void play().catch(() => {});
}

export const capybaraTracks = {
  id: "capybara-tracks",
  label: "Capybara tracks",
  color: "#a9652b",
  textColor: "#ffe6c2",
  taunt: "Something filthy is waddling onto your page…",
  mount,
};
