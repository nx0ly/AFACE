const SLOT_COUNT = 64;

const RED = "#c62828";
const BLACK = "#111111";
const GREEN = "#16a05a";

const SLOT_ANGLE = 360 / SLOT_COUNT;

const wheel = document.getElementById("wheel");
const spinButton = document.getElementById("spin");
const result = document.getElementById("result");

const greenSlots = new Set();

while (greenSlots.size < 2) {
    const randomSlot = Math.floor(Math.random() * SLOT_COUNT);

    greenSlots.add(randomSlot);
}

const stops = [];

for (let i = 0; i < SLOT_COUNT; i++) {
    let color;

    if (greenSlots.has(i)) {
        color = GREEN;
    } else {
        color = i % 2 === 0 ? RED : BLACK;
    }

    const start = i * SLOT_ANGLE;
    const end = (i + 1) * SLOT_ANGLE;

    stops.push(`${color} ${start}deg ${end}deg`);
}

wheel.style.background = `conic-gradient(from 0deg, ${stops.join(",")})`;

let rotation = 0;
let spinning = false;

async function awardToken() {
    const storage = globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
    if (!storage) return;

    const key = "page-pause:tokens";
    const saved = await storage.get(key);
    const current = typeof saved[key] === "number" ? Math.max(0, Math.floor(saved[key])) : 0;
    await storage.set({ [key]: current + 1 });
}

spinButton.addEventListener("click", () => {
    if (spinning) return;

    spinning = true;
    spinButton.disabled = true;

    result.textContent = "SPINNING...";
    result.style.color = "#fff";

    const winningSlot = Math.floor(Math.random() * SLOT_COUNT);

    let winningColor;

    if (greenSlots.has(winningSlot)) {
        winningColor = "GREEN";
    } else {
        winningColor = winningSlot % 2 === 0 ? "RED" : "BLACK";
    }

    const winningCenter = winningSlot * SLOT_ANGLE + SLOT_ANGLE / 2;

    const withinSlot = (Math.random() - 0.5) * (SLOT_ANGLE * 0.55);

    const targetAngle = 360 - winningCenter + withinSlot;

    const fullSpins = 6 + Math.floor(Math.random() * 4);

    rotation += fullSpins * 360 + targetAngle - (rotation % 360);

    wheel.style.transform = `rotate(${rotation}deg)`;

    setTimeout(() => {
        result.textContent = winningColor;

        if (winningColor === "RED") {
            result.style.color = RED;
        } else if (winningColor === "BLACK") {
            result.style.color = "#fff";
        } else {
            result.style.color = GREEN;
            result.textContent = "GREEN · +1 TOKEN";
            void awardToken();
        }

        spinning = false;
        spinButton.disabled = false;
    }, 5600);
});
