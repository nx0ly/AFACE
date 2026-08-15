const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const mangoImg = new Image();
mangoImg.src = "/images/mango.png";

const gravity = 900;
const powerMultiplier = 4.5;
const powerVariance = 0.08;

const target = {
    x: canvas.width / 2,
    y: 125,
    bocinRadius: 32,
    mechaDistance: 52,
    mechaRadius: 9,
};

const tejo = {
    x: 0,
    y: canvas.height - 85,
    z: 0,

    vx: 0,
    vy: 0,
    vz: 0,

    radius: 22,

    dragging: false,
    flying: false,
    landed: false,
    hit: false,

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

async function awardToken() {
    const storage = globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
    if (!storage) return;

    const key = "page-pause:tokens";
    const saved = await storage.get(key);
    const current = typeof saved[key] === "number" ? Math.floor(saved[key]) : 0;
    await storage.set({ [key]: current + 1 });
}

function randomSpawn() {
    tejo.x = 300 + Math.random() * 600;
    tejo.y = canvas.height - 85;
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

    mechas.forEach((m) => (m.hit = false));

    message = "";
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

    const nx = dx / length;
    const ny = dy / length;

    const lineLength = 40 + power * 150;

    ctx.beginPath();

    ctx.moveTo(tejo.x, tejo.y);

    ctx.lineTo(tejo.x + nx * lineLength, tejo.y + ny * lineLength);

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;

    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
        `${Math.round(power * 100)}%`,
        tejo.x + nx * lineLength,
        tejo.y + ny * lineLength - 12,
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

function launch() {
    const dx = tejo.x - tejo.dragX;

    const dy = tejo.y - tejo.dragY;

    const length = Math.hypot(dx, dy);

    if (length < 10) return;

    const power = Math.min(length, 250);

    const nx = dx / length;

    const ny = dy / length;

    const variance = 1 + (Math.random() * 2 - 1) * powerVariance;

    const angleVariance = (Math.random() * 2 - 1) * 0.025;

    const angle = Math.atan2(ny, nx) + angleVariance;

    const speed = power * powerMultiplier * variance;

    tejo.vx = Math.cos(angle) * speed;

    tejo.vy = Math.sin(angle) * speed;

    tejo.vz = clamp(power * 3.3 * variance, 350, 900);

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

    if (mechaHit) {
        tejo.hit = true;
        score += 3;
        message = "¡MECHA! +3";
    } else if (targetDistance < target.bocinRadius) {
        tejo.hit = true;
        score += 6;
        message = "¡EMBOCINADA! +6";
    } else if (
        tejo.x > target.x - 100 &&
        tejo.x < target.x + 100 &&
        tejo.y > target.y - 60 &&
        tejo.y < target.y + 70
    ) {
        tejo.hit = true;
        score += 1;
        message = "¡MANO! +1";
    } else {
        message = "¡FALLASTE!";
    }

    if (tejo.hit) {
        void awardToken();
        message = "ARRIBA TEJOOOOO!!! +1 BEAN";
    }

    messageTimer = 1.5;
}

function update(dt) {
    if (!tejo.flying) return;

    tejo.x += tejo.vx * dt;
    tejo.y += tejo.vy * dt;

    tejo.vz -= gravity * dt;
    tejo.z += tejo.vz * dt;

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

let lastTime = performance.now();

function loop(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.033);

    lastTime = time;

    update(dt);

    if (messageTimer > 0) {
        messageTimer -= dt;
    }

    draw();

    requestAnimationFrame(loop);
}

reset();
requestAnimationFrame(loop);
