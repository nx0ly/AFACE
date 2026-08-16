const SLOT_COUNT = 18; // Reduced from 36 to make franjas bigger

const YELLOW = "#FCD116"; // Colombian Flag Yellow
const BLUE = "#003893";   // Colombian Flag Blue
const RED = "#CE1126";    // Colombian Flag Red

const SLOT_ANGLE = 360 / SLOT_COUNT;

const wheel = document.getElementById("wheel");
const spinButton = document.getElementById("spin");
const result = document.getElementById("result");
const betAmountInput = document.getElementById("bet-amount");
const balanceDisplay = document.getElementById("balance");

const colorBtns = document.querySelectorAll(".color-btn");
let selectedColor = null;
let currentBalance = 0;

const TOKEN_BALANCE_KEY = "page-pause:tokens";

// 1 Red slot, 8 Yellow slots, 9 Blue slots (or roughly)
const redSlots = new Set();
while (redSlots.size < 1) {
    const randomSlot = Math.floor(Math.random() * SLOT_COUNT);
    redSlots.add(randomSlot);
}

const stops = [];
for (let i = 0; i < SLOT_COUNT; i++) {
    let color;
    if (redSlots.has(i)) {
        color = RED;
    } else {
        // Alternate Yellow and Blue for the rest
        color = i % 2 === 0 ? YELLOW : BLUE;
    }
    const start = i * SLOT_ANGLE;
    const end = (i + 1) * SLOT_ANGLE;
    stops.push(`${color} ${start}deg ${end}deg`);
}

wheel.style.background = `conic-gradient(from 0deg, ${stops.join(",")})`;

let rotation = 0;
let spinning = false;

function getStorage() {
    return globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
}

async function loadBalance() {
    const storage = getStorage();
    if (!storage) return;
    const saved = await storage.get(TOKEN_BALANCE_KEY);
    currentBalance = typeof saved[TOKEN_BALANCE_KEY] === "number" ? Math.floor(saved[TOKEN_BALANCE_KEY]) : 0;
    balanceDisplay.textContent = currentBalance;
}

async function updateBalance(delta) {
    const storage = getStorage();
    if (!storage) return;
    currentBalance = currentBalance + delta;
    balanceDisplay.textContent = currentBalance;
    await storage.set({ [TOKEN_BALANCE_KEY]: currentBalance });
}

colorBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        if (spinning) return;
        colorBtns.forEach(b => b.removeAttribute("data-selected"));
        btn.setAttribute("data-selected", "true");
        selectedColor = btn.textContent.trim().toUpperCase();
    });
});

spinButton.addEventListener("click", async () => {
    if (spinning) return;
    
    if (!selectedColor) {
        result.textContent = "SELECT A COLOR";
        result.style.color = "#fff";
        return;
    }

    const betAmount = parseInt(betAmountInput.value, 10);
    if (isNaN(betAmount) || betAmount < 1) {
        result.textContent = "INVALID BET";
        result.style.color = "#fff";
        return;
    }

    if (currentBalance < betAmount) {
        result.textContent = "NOT ENOUGH BEANS";
        result.style.color = "#fff";
        return;
    }

    spinning = true;
    spinButton.disabled = true;
    
    await updateBalance(-betAmount);

    result.textContent = "SPINNING...";
    result.style.color = "#fff";

    const winningSlot = Math.floor(Math.random() * SLOT_COUNT);
    let winningColor;
    if (redSlots.has(winningSlot)) {
        winningColor = "RED";
    } else {
        winningColor = winningSlot % 2 === 0 ? "YELLOW" : "BLUE";
    }

    const winningCenter = winningSlot * SLOT_ANGLE + SLOT_ANGLE / 2;
    const withinSlot = (Math.random() - 0.5) * (SLOT_ANGLE * 0.55);
    const targetAngle = 360 - winningCenter + withinSlot;
    const fullSpins = 6 + Math.floor(Math.random() * 4);

    rotation += fullSpins * 360 + targetAngle - (rotation % 360);
    wheel.style.transform = `rotate(${rotation}deg)`;

    setTimeout(async () => {
        result.textContent = winningColor;

        if (winningColor === "YELLOW") {
            result.style.color = YELLOW;
        } else if (winningColor === "BLUE") {
            result.style.color = "#00aaff"; // brighter blue for text legibility on dark bg
        } else {
            result.style.color = RED;
        }

        // Strict payout matching logic
        if (winningColor === selectedColor) {
            const multiplier = winningColor === "RED" ? 18 : 2;
            const winnings = betAmount * multiplier;
            result.textContent = `${winningColor} · YOU WON ${winnings} BEANS!`;
            await updateBalance(winnings);
        } else {
            result.textContent = `${winningColor} · YOU LOST`;
        }

        spinning = false;
        spinButton.disabled = false;
    }, 5600);
});

loadBalance();

// DVD Bouncing Ads State & Logic
const ads = [
    { el: document.getElementById("ad-roul-1"), x: 100, y: 100, vx: 150, vy: 150, width: 250, height: 100 },
    { el: document.getElementById("ad-roul-2"), x: 300, y: 200, vx: -200, vy: 120, width: 150, height: 100 },
    { el: document.getElementById("ad-roul-3"), x: 500, y: 50, vx: 100, vy: -180, width: 100, height: 100 }
];

let lastTime = performance.now();
function animateAds(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.033);
    lastTime = time;

    ads.forEach(ad => {
        ad.x += ad.vx * dt;
        ad.y += ad.vy * dt;

        if (ad.x <= 0 || ad.x + ad.width >= window.innerWidth) {
            ad.vx *= -1;
            ad.x = Math.max(0, Math.min(ad.x, window.innerWidth - ad.width));
        }
        if (ad.y <= 0 || ad.y + ad.height >= window.innerHeight) {
            ad.vy *= -1;
            ad.y = Math.max(0, Math.min(ad.y, window.innerHeight - ad.height));
        }

        if (ad.el) {
            ad.el.style.left = `${ad.x}px`;
            ad.el.style.top = `${ad.y}px`;
        }
    });

    requestAnimationFrame(animateAds);
}

requestAnimationFrame(animateAds);
