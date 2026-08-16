const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const retryBtn = document.getElementById("retry-btn");

const extApi = globalThis.browser ?? globalThis.chrome;

const mangoImg = new Image();
mangoImg.src = extApi
  ? extApi.runtime.getURL("images/mango.png")
  : "/images/mango.png";

const nathanImg = new Image();
nathanImg.src = extApi
  ? extApi.runtime.getURL("images/nathan_tejo.png")
  : "/images/nathan_tejo.png";

const gravity = 900;
const powerMultiplier = 4.5;
const powerVariance = 0.04;

const targets = [
  { x: canvas.width / 2, y: 125, radius: 50, points: 19 }, // Center
  { x: canvas.width / 2 - 120, y: 125, radius: 25, points: 39 }, // Left (smaller, more points)
  { x: canvas.width / 2 + 120, y: 125, radius: 35, points: 20 }, // Right
];

let tejo = getInitialTejoState();

function getInitialTejoState() {
  return {
    x: canvas.width / 2,
    y: canvas.height - 85,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    radius: 22,
    state: "INIT", // INIT, DIR, POWER, FLYING, LANDED. yk enums would be REALLY nice here ._.
    dirOsc: 0,
    powOsc: 0,
    hit: false,
    rotation: 0,
  };
}

let score = 0;
let message = "";
let messageTimer = 0;
let timeElapsed = 0;

// DVD Bouncing Ads State
const ads = [
  {
    el: document.getElementById("ad-tejo"),
    x: 100,
    y: 100,
    vx: 150,
    vy: 150,
    width: 150,
    height: 100,
  },
  {
    el: document.getElementById("ad-tejo-2"),
    x: 300,
    y: 200,
    vx: -200,
    vy: 120,
    width: 200,
    height: 100,
  },
  {
    el: document.getElementById("ad-tejo-3"),
    x: 500,
    y: 50,
    vx: 100,
    vy: -180,
    width: 100,
    height: 100,
  },
];

const TOKEN_BALANCE_KEY = "page-pause:tokens";

function getStorage() {
  return (
    globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local
  );
}

// Pull the real bean balance so the on-screen counter starts from the
// truth.
async function loadScore() {
  const storage = getStorage();
  if (!storage) return;

  const saved = await storage.get(TOKEN_BALANCE_KEY);
  const value = saved[TOKEN_BALANCE_KEY];
  score =
    typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
}

// Award the actual hit amount (1/3/6).
async function awardToken(amount) {
  const storage = getStorage();
  if (!storage) return;

  const saved = await storage.get(TOKEN_BALANCE_KEY);
  const current =
    typeof saved[TOKEN_BALANCE_KEY] === "number"
      ? Math.floor(saved[TOKEN_BALANCE_KEY])
      : 0;
  const next = current + amount;

  await storage.set({ [TOKEN_BALANCE_KEY]: next });

  // Mirror storage back into the on-screen counter so it always matches the
  // banked total, never drifts above/below it.
  score = next;
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function reset() {
  tejo = getInitialTejoState();
  tejo.state = "DIR";
  message = "";
  cleanupMLG();
  retryBtn.style.display = "none";
}

document.getElementById("start-game-btn").addEventListener("click", () => {
  document.getElementById("instructions-modal").classList.add("hidden");
  tejo.state = "DIR";
});

function drawField() {
  ctx.save();

  // Draw gray background for the board
  ctx.fillStyle = "rgba(128, 128, 128, 0.85)";
  ctx.fillRect(230, 0, 740, canvas.height);

  ctx.globalAlpha = 0.85;

  ctx.strokeStyle = "#9b7846";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(230, 0);
  ctx.lineTo(230, canvas.height);
  ctx.moveTo(970, 0);
  ctx.lineTo(970, canvas.height);
  ctx.stroke();

  ctx.strokeStyle = "#a98552";
  ctx.lineWidth = 2;

  for (let y = 40; y < canvas.height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(230, y);
    ctx.lineTo(970, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawTarget() {
  targets.forEach((t) => {
    const size = t.radius * 3;
    if (nathanImg.complete && nathanImg.naturalHeight !== 0) {
      ctx.drawImage(nathanImg, t.x - size / 2, t.y - size / 2, size, size);
    } else {
      ctx.fillStyle = "black";
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawTejo() {
  const scale = 1 + tejo.z * 0.00055;

  ctx.save();

  // Shadow
  ctx.beginPath();
  ctx.ellipse(
    tejo.x,
    tejo.y + 8,
    tejo.radius * 0.9,
    tejo.radius * 0.3,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "rgba(0,0,0,.2)";
  ctx.fill();

  ctx.translate(tejo.x, tejo.y - tejo.z);
  ctx.scale(scale, scale);
  ctx.rotate(tejo.rotation);

  const size = tejo.radius * 2.5;
  if (mangoImg.complete && mangoImg.naturalHeight !== 0) {
    ctx.drawImage(mangoImg, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = "orange";
    ctx.beginPath();
    ctx.arc(0, 0, tejo.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (tejo.hit) {
    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, tejo.radius * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawMeters() {
  if (
    tejo.state === "INIT" ||
    tejo.state === "FLYING" ||
    tejo.state === "LANDED"
  )
    return;

  // Draw Direction Meter
  const dirWidth = 200;
  const dirX = canvas.width / 2 - dirWidth / 2;
  const dirY = canvas.height - 40;

  ctx.fillStyle = "#222";
  ctx.fillRect(dirX, dirY, dirWidth, 20);
  ctx.strokeStyle = "silver";
  ctx.strokeRect(dirX, dirY, dirWidth, 20);

  // cursor
  const cursorX = dirX + dirWidth / 2 + (tejo.dirOsc * dirWidth) / 2;
  ctx.fillStyle = tejo.state === "DIR" ? "yellow" : "gray";
  ctx.fillRect(cursorX - 5, dirY - 5, 10, 30);

  // Draw Power Meter
  if (tejo.state === "POWER") {
    const powHeight = 300;
    const powX = canvas.width - 80;
    const powY = canvas.height - 100 - powHeight;

    // Draw gradient background
    const grad = ctx.createLinearGradient(0, powY + powHeight, 0, powY);
    grad.addColorStop(0, "red");
    grad.addColorStop(0.5, "yellow");
    grad.addColorStop(0.75, "green"); // perfect zone
    grad.addColorStop(1, "red"); // overshoot

    ctx.fillStyle = grad;
    ctx.fillRect(powX, powY, 30, powHeight);
    ctx.strokeStyle = "white";
    ctx.strokeRect(powX, powY, 30, powHeight);

    // cursor
    const powCursorY = powY + powHeight - tejo.powOsc * powHeight;
    ctx.fillStyle = "white";
    ctx.fillRect(powX - 10, powCursorY - 5, 50, 10);
  }
}

function drawUI() {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "left";

    if (messageTimer > 0) {
        // Flashing CARAMBOLA
        ctx.font = "bold 80px 'Arial Black', sans-serif";
        ctx.textAlign = "center";
        
        // Random colors for MLG flashing
        if (Math.random() > 0.5) {
            ctx.fillStyle = "yellow";
            ctx.strokeStyle = "red";
        } else {
            ctx.fillStyle = "cyan";
            ctx.strokeStyle = "magenta";
        }

        ctx.lineWidth = 5;
        ctx.strokeText(message, canvas.width / 2, 350);
        ctx.fillText(message, canvas.width / 2, 350);
    }

    ctx.lineWidth = 5;
    ctx.strokeText(message, canvas.width / 2, 350);
    ctx.fillText(message, canvas.width / 2, 350);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height); // clear for transparent background
  drawField();
  drawTarget();
  drawTejo();
  drawMeters();
  drawUI();
}

function launch() {
  // Math to convert meters to throw vector
  // dirOsc is -1 to 1. Angle points up (-PI/2).
  // son
  const angle = -Math.PI / 2 + (tejo.dirOsc * Math.PI) / 4;

  // powOsc is 0 to 1. 0.75 is perfect distance.
  const maxDistLength = 140; // max length
  const length = tejo.powOsc * maxDistLength;

  const power = Math.min(length, 250);
  const variance = 1 + (Math.random() * 2 - 1) * powerVariance;
  const speed = power * powerMultiplier * variance;

  tejo.vx = Math.cos(angle) * speed;
  tejo.vy = Math.sin(angle) * speed;
  tejo.vz = clamp(power * 3.3 * variance, 350, 900);

  tejo.state = "FLYING";
}

function triggerMLGEffects() {
  document.getElementById("guy-left").classList.remove("hidden");
  document.getElementById("guy-right").classList.remove("hidden");

  // Spawn falling arepas fast
  for (let i = 0; i < 60; i++) {
    const arepa = document.createElement("div");
    arepa.className = "falling-arepa mlg-arepa";
    arepa.style.left = Math.random() * 100 + "%";
    arepa.style.animationDuration = 0.5 + Math.random() + "s";
    arepa.style.animationDelay = Math.random() * 0.5 + "s";
    arepa.style.width = "128px";
    arepa.style.height = "128px";
    document.body.appendChild(arepa);
  }
}

function cleanupMLG() {
  document.getElementById("guy-left").classList.add("hidden");
  document.getElementById("guy-right").classList.add("hidden");
  document.querySelectorAll(".mlg-arepa").forEach((el) => el.remove());
}

function land() {
  tejo.z = 0;
  tejo.state = "LANDED";

  const hitTarget = targets.find(
    (t) => distance(tejo.x, tejo.y, t.x, t.y) < t.radius,
  );
  let isCarambola = false;

  if (hitTarget) {
    tejo.hit = true;
    score += hitTarget.points;
    message = `BULLSEYE!!!! +${hitTarget.points}`;
    isCarambola = true;
  } else if (
    tejo.x > targets[1].x - 60 &&
    tejo.x < targets[2].x + 60 &&
    tejo.y > targets[0].y - 60 &&
    tejo.y < targets[0].y + 70
  ) {
    tejo.hit = true;
    message = "CLOSE! +1";
  } else {
    message = "MISSED!";
  }

  if (tejo.hit) {
    const reward = hitTarget ? hitTarget.points : 1;
    void awardToken(reward);
  }

  if (isCarambola) {
    triggerMLGEffects();
  }

  retryBtn.style.display = "block";
  messageTimer = 3.0; // Wait 3s before reset
}

function update(dt) {
  timeElapsed += dt;

  // Update DVD bouncing ads
  ads.forEach((ad) => {
    ad.x += ad.vx * dt;
    ad.y += ad.vy * dt;

    if (ad.x <= 0 || ad.x + ad.width >= window.innerWidth) {
      ad.vx *= -1;
      ad.x = clamp(ad.x, 0, window.innerWidth - ad.width);
    }
    if (ad.y <= 0 || ad.y + ad.height >= window.innerHeight) {
      ad.vy *= -1;
      ad.y = clamp(ad.y, 0, window.innerHeight - ad.height);
    }

    if (ad.el) {
      ad.el.style.left = `${ad.x}px`;
      ad.el.style.top = `${ad.y}px`;
    }
  });

  if (tejo.state === "DIR") {
    // Oscillate between -1 and 1
    tejo.dirOsc = Math.sin(timeElapsed * 4);
  } else if (tejo.state === "POWER") {
    // Oscillate between 0 and 1
    tejo.powOsc = (Math.sin(timeElapsed * 5) + 1) / 2;
  } else if (tejo.state === "FLYING") {
    tejo.x += tejo.vx * dt;
    tejo.y += tejo.vy * dt;

    tejo.vz -= gravity * dt;
    tejo.z += tejo.vz * dt;

    // Tumble the mango as it flies, faster shots spin quicker.
    const horizSpeed = Math.hypot(tejo.vx, tejo.vy);
    tejo.rotation += horizSpeed * dt * 0.004;

    if (tejo.z <= 0) {
      land();
    }
  } else if (tejo.state === "LANDED") {
    // Just wait for user to click retryBtn
  }
}

canvas.addEventListener("pointerdown", () => {
  if (tejo.state === "DIR") {
    tejo.state = "POWER";
  } else if (tejo.state === "POWER") {
    launch();
  }
});

retryBtn.addEventListener("click", reset);
let lastTime = performance.now();

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.033);
  lastTime = time;

  update(dt);

  // Hold the result message on screen while the tejo is landed.
  if (messageTimer > 0 && !tejo.landed) {
    messageTimer -= dt;
  }

  draw();

  requestAnimationFrame(loop);
}

reset();
void loadScore();
requestAnimationFrame(loop);
