const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const retryBtn = document.getElementById("retry-btn");

const mangoImg = new Image();
mangoImg.src = "/images/mango.png";

const gravity = 900;
const powerMultiplier = 4.5;
const powerVariance = 0.03; // keep shots close to the aim preview
const angleJitter = 0.01;

const target = {
    x: canvas.width / 2,
    y: 125,
    bocinRadius: 32,
    mechaDistance: 52,
    mechaRadius: 9,
};

const tejo = {
    x: 0,
    y: canvas.height - 150,
    z: 0,

    vx: 0,
    vy: 0,
    vz: 0,

    radius: 22,

    dragging: false,
    flying: false,
    landed: false,
    hit: false,

    rotation: 0,

    dragX: 0,
    dragY: 0,
};

const mechas = [
    { x: 0, y: -target.mechaDistance, hit: false },
    { x: target.mechaDistance, y: 0, hit: false },
    { x: 0, y: target.mechaDistance, hit: false },
    { x: -target.mechaDistance, y: 0, hit: false },
];

let score = 0;
let message = "";
let messageTimer = 0;

const TOKEN_BALANCE_KEY = "page-pause:tokens";

function getStorage() {
    return globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
}

// Pull the real bean balance so the on-screen counter starts from the
// truth (the banked total from past sessions / other games), not zero.
async function loadScore() {
    const storage = getStorage();
    if (!storage) return;

    const saved = await storage.get(TOKEN_BALANCE_KEY);
    const value = saved[TOKEN_BALANCE_KEY];
    score = typeof value === "number" && Number.isFinite(value)
        ? Math.floor(value)
        : 0;
}

// Award the actual hit amount (1/3/6), not a flat +1 — otherwise the "¡MECHA!
// +3" message lies about what was banked. Read-modify-write keeps us in sync
// with beans spent elsewhere (blocked page, adivina) instead of clobbering.
async function awardToken(amount) {
    const storage = getStorage();
    if (!storage) return;

    const saved = await storage.get(TOKEN_BALANCE_KEY);
    const current = typeof saved[TOKEN_BALANCE_KEY] === "number"
        ? Math.floor(saved[TOKEN_BALANCE_KEY])
        : 0;
    const next = current + amount;

    await storage.set({ [TOKEN_BALANCE_KEY]: next });

    // Mirror storage back into the on-screen counter so it always matches the
    // banked total, never drifts above/below it.
    score = next;
}

function randomSpawn() {
    tejo.x = 300 + Math.random() * 600;
    tejo.y = canvas.height - 150;
}

function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function pointerPosition(e) {
    const rect = canvas.getBoundingClientRect();

    return {
        x: ((e.clientX - rect.left) * canvas.width) / rect.width,
        y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
}

function reset() {
    randomSpawn();

    tejo.z = 0;
    tejo.vx = 0;
    tejo.vy = 0;
    tejo.vz = 0;

    tejo.dragging = false;
    tejo.flying = false;
    tejo.landed = false;
    tejo.hit = false;
    tejo.rotation = 0;

    mechas.forEach((m) => (m.hit = false));

    message = "";

    retryBtn.style.display = "none";
}

function drawField() {
    ctx.fillStyle = "#c9a66b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#d5b77c";
    ctx.fillRect(230, 0, 740, canvas.height);

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

    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.fillRect(230, 0, 740, 5);
}

function drawTarget() {
    ctx.fillStyle = "#8f6235";

    ctx.fillRect(target.x - 115, target.y - 75, 230, 160);

    ctx.fillStyle = "#c49b5d";

    ctx.fillRect(target.x - 100, target.y - 60, 200, 130);

    ctx.beginPath();

    ctx.arc(
        target.x,
        target.y,
        target.bocinRadius + 7,
        0,
        Math.PI * 2,
    );

    ctx.fillStyle = "#333";
    ctx.fill();

    ctx.beginPath();

    ctx.arc(target.x, target.y, target.bocinRadius, 0, Math.PI * 2);

    ctx.fillStyle = "#111";
    ctx.fill();

    mechas.forEach((mecha) => {
        const x = target.x + mecha.x;
        const y = target.y + mecha.y;

        ctx.beginPath();

        ctx.moveTo(x, y - 10);
        ctx.lineTo(x + 9, y + 7);
        ctx.lineTo(x - 9, y + 7);

        ctx.closePath();

        ctx.fillStyle = mecha.hit ? "#e33" : "#222";

        ctx.fill();
    });
}

function drawAim() {
    if (!tejo.dragging) return;

    const dx = tejo.x - tejo.dragX;
    const dy = tejo.y - tejo.dragY;
    const length = Math.hypot(dx, dy);

    if (length < 2) return;

    const power = clamp(length / 250, 0, 1);

    // Predicted trajectory arc (slingshot preview, Angry Birds style).
    // Reuses the real launch physics with jitter = 0 so the dots trace
    // exactly where a clean shot will fly.
    const v = launchVelocity(0);

    if (v) {
        const points = [];

        let x = tejo.x;
        let y = tejo.y;
        let z = 0;
        let vz = v.vz;

        const step = 0.02;

        for (let t = 0; t < 4; t += step) {
            points.push({ x, y, z });

            x += v.vx * step;
            y += v.vy * step;
            vz -= gravity * step;
            z += vz * step;

            if (z <= 0 && t > 0) {
                points.push({ x, y, z: 0 });
                break;
            }
        }

        // ~10 dots along the arc, lifted by z so it rises on screen the
        // same way the mango will, shrinking toward the end.
        const dotStep = Math.max(1, Math.floor(points.length / 10));

        ctx.fillStyle = "#fff";

        // Solid along the first half of the arc (the launch direction is a
        // fair hint). Begin fading at 50%, fully invisible by 80% — so the
        // far end (landing-point prediction, the OP part) never draws.
        const FADE_START = 0.5;
        const FADE_END = 0.8;
        const MAX_ALPHA = 0.8;

        for (let i = dotStep; i < points.length; i += dotStep) {
            const p = points[i];
            const tt = i / points.length;
            const r = 5 - tt * 2.6;

            if (r <= 0) break;

            // Solid up to FADE_START, linear fade to invisible by FADE_END.
            let alpha;
            if (tt <= FADE_START) {
                alpha = MAX_ALPHA;
            } else if (tt >= FADE_END) {
                break;
            } else {
                alpha = MAX_ALPHA * (1 - (tt - FADE_START) / (FADE_END - FADE_START));
            }

            ctx.globalAlpha = alpha;

            ctx.beginPath();
            ctx.arc(p.x, p.y - p.z, r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }

    // Power label floating just off the tejo along the launch direction.
    const nx = length > 0 ? dx / length : 0;
    const ny = length > 0 ? dy / length : 0;

    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
        `${Math.round(power * 100)}%`,
        tejo.x + nx * 40,
        tejo.y + ny * 40 - 12,
    );
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
    ctx.drawImage(mangoImg, -size / 2, -size / 2, size, size);

    if (tejo.hit) {
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, tejo.radius * 1.5, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}



function drawUI() {
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(canvas.width - 250, 20, 230, 45);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "left";

    ctx.fillText(`COFFEE BEANS: ${score}`, canvas.width - 235, 49);

    if (!tejo.flying && !tejo.landed) {
        ctx.font = "16px Arial";
        ctx.textAlign = "center";

        ctx.fillText(
            "Arrastra el tejo y suelta para lanzar",
            canvas.width / 2,
            canvas.height - 22,
        );
    }

    if (messageTimer > 0) {
        ctx.font = "bold 34px Arial";
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";

        ctx.fillText(message, canvas.width / 2, 290);
    }
}

function draw() {
    drawField();
    drawTarget();
    drawAim();
    drawTejo();
    drawUI();
}

function launchVelocity(jitter) {
    const dx = tejo.x - tejo.dragX;
    const dy = tejo.y - tejo.dragY;
    const length = Math.hypot(dx, dy);

    if (length < 1) return null;

    const power = Math.min(length, 250);

    const vFactor = 1 + (Math.random() * 2 - 1) * powerVariance * jitter;
    const aJitter = (Math.random() * 2 - 1) * angleJitter * jitter;

    const angle = Math.atan2(dy, dx) + aJitter;
    const speed = power * powerMultiplier * vFactor;

    return {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: clamp(power * 3.3 * vFactor, 350, 900),
        power,
        length,
    };
}

function launch() {
    const v = launchVelocity(1);

    if (!v || v.length < 10) return;

    tejo.vx = v.vx;
    tejo.vy = v.vy;
    tejo.vz = v.vz;

    tejo.flying = true;
}

function land() {
    tejo.z = 0;
    tejo.flying = false;
    tejo.landed = true;

    const targetDistance = distance(
        tejo.x,
        tejo.y,
        target.x,
        target.y,
    );

    let mechaHit = false;

    mechas.forEach((mecha) => {
        const hitDistance = distance(
            tejo.x,
            tejo.y,
            target.x + mecha.x,
            target.y + mecha.y,
        );

        if (hitDistance < tejo.radius + target.mechaRadius) {
            mecha.hit = true;
            mechaHit = true;
        }
    });

    let amount = 0;

    if (mechaHit) {
        tejo.hit = true;
        amount = 3;
        message = "¡MECHA! +3";
    } else if (targetDistance < target.bocinRadius) {
        tejo.hit = true;
        amount = 6;
        message = "¡EMBOCINADA! +6";
    } else if (
        tejo.x > target.x - 100 &&
        tejo.x < target.x + 100 &&
        tejo.y > target.y - 60 &&
        tejo.y < target.y + 70
    ) {
        tejo.hit = true;
        amount = 1;
        message = "¡MANO! +1";
    } else {
        message = "¡FALLASTE!";
    }

    score += amount;

    if (tejo.hit) {
        void awardToken(amount);
    }

    // Keep the result on screen and offer a retry instead of leaving a
    // dead field after the throw lands.
    retryBtn.style.display = "block";
    messageTimer = 1.5;
}

function update(dt) {
    if (!tejo.flying) return;

    tejo.x += tejo.vx * dt;
    tejo.y += tejo.vy * dt;

    tejo.vz -= gravity * dt;
    tejo.z += tejo.vz * dt;

    // Tumble the mango as it flies — faster shots spin quicker.
    const horizSpeed = Math.hypot(tejo.vx, tejo.vy);
    tejo.rotation += horizSpeed * dt * 0.004;

    if (tejo.z <= 0) {
        land();
    }
}

canvas.addEventListener("pointerdown", (e) => {
    if (tejo.flying || tejo.landed) return;

    const p = pointerPosition(e);

    if (distance(p.x, p.y, tejo.x, tejo.y) < 50) {
        tejo.dragging = true;

        tejo.dragX = p.x;
        tejo.dragY = p.y;

        canvas.classList.add("dragging");

        canvas.setPointerCapture(e.pointerId);
    }
});

canvas.addEventListener("pointermove", (e) => {
    if (!tejo.dragging) return;

    const p = pointerPosition(e);

    tejo.dragX = p.x;
    tejo.dragY = p.y;
});

canvas.addEventListener("pointerup", () => {
    if (!tejo.dragging) return;

    tejo.dragging = false;

    canvas.classList.remove("dragging");

    launch();
});

canvas.addEventListener("dblclick", reset);

retryBtn.addEventListener("click", reset);

let lastTime = performance.now();

function loop(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.033);

    lastTime = time;

    update(dt);

    // Hold the result message on screen while the tejo is landed — the
    // retry button is up, so don't fade the score line out from under it.
    if (messageTimer > 0 && !tejo.landed) {
        messageTimer -= dt;
    }

    draw();

    requestAnimationFrame(loop);
}

reset();
void loadScore();
requestAnimationFrame(loop);
