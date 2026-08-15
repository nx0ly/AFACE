"use strict";

const TOKEN_BALANCE_KEY = "page-pause:tokens";
const SAVE_KEY = "page-pause:mango-clicker";
const MANGOS_PER_TOKEN = 5000;

const COMBO_WINDOW = 700;
const COMBO_STEP = 0.25;
const COMBO_MAX = 4;

const MIN_CLICK_GAP = 35;

const UPGRADES = [
    {
        id: "machete",
        name: "Sharper machete",
        desc: "+1 mango per pick.",
        base: 15,
        growth: 1.35,
    },
    {
        id: "grove",
        name: "Another mango tree",
        desc: "+0.5 mangos per second, hands free.",
        base: 60,
        growth: 1.45,
    },
    {
        id: "basket",
        name: "Bigger basket",
        desc: "+25% to everything you earn.",
        base: 600,
        growth: 2.2,
    },
];

const state = {
    mangos: 0,
    lifetime: 0,
    clicks: 0,
    tokensPaid: 0,
    machete: 0,
    grove: 0,
    basket: 0,
};

const mangoButton = document.getElementById("mango");
const orchard = document.querySelector(".orchard");
const comboBadge = document.getElementById("combo");
const upgradeList = document.getElementById("upgrades");
const tokenFill = document.getElementById("token-fill");
const statusLine = document.getElementById("status");

const display = {
    score: document.getElementById("score"),
    power: document.getElementById("power"),
    perSec: document.getElementById("persec"),
    lifetime: document.getElementById("lifetime"),
    clicks: document.getElementById("clicks"),
    tokens: document.getElementById("tokens"),
};

const storage =
    globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;

let combo = 1;
let lastClick = 0;
let comboTimer = null;
let statusTimer = null;

function multiplier() {
    return Math.pow(1.25, state.basket);
}

function clickPower() {
    return (1 + state.machete) * multiplier();
}

function perSecond() {
    return state.grove * 0.5 * multiplier();
}

function costOf(upgrade) {
    return Math.ceil(upgrade.base * Math.pow(upgrade.growth, state[upgrade.id]));
}

function format(value) {
    const rounded = Math.floor(value);

    if (rounded < 1000000) return rounded.toLocaleString();
    if (rounded < 1000000000) return (rounded / 1000000).toFixed(2) + "M";

    return (rounded / 1000000000).toFixed(2) + "B";
}

function setStatus(text) {
    statusLine.textContent = text;

    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
        statusLine.textContent = "";
    }, 2200);
}

async function payOutTokens() {
    const owed = Math.floor(state.lifetime / MANGOS_PER_TOKEN) - state.tokensPaid;
    if (owed <= 0) return;

    state.tokensPaid += owed;
    setStatus(owed === 1 ? "+1 token banked!" : `+${owed} tokens banked!`);

    if (!storage) return;

    const saved = await storage.get(TOKEN_BALANCE_KEY);
    const current =
        typeof saved[TOKEN_BALANCE_KEY] === "number"
            ? Math.max(0, Math.floor(saved[TOKEN_BALANCE_KEY]))
            : 0;

    await storage.set({ [TOKEN_BALANCE_KEY]: current + owed });
}

function earn(amount) {
    state.mangos += amount;
    state.lifetime += amount;

    payOutTokens();
}

function pop(x, y, amount) {
    const label = document.createElement("div");

    label.className = "pop";
    label.textContent = "+" + format(amount);
    label.style.left = x + "px";
    label.style.top = y + "px";

    orchard.appendChild(label);
    setTimeout(() => label.remove(), 850);

    for (let i = 0; i < 6; i++) {
        const drop = document.createElement("span");
        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 55;

        drop.className = "splash";
        drop.style.left = x + "px";
        drop.style.top = y + "px";
        drop.style.setProperty("--dx", Math.cos(angle) * distance + "px");
        drop.style.setProperty("--dy", Math.sin(angle) * distance + "px");

        orchard.appendChild(drop);
        setTimeout(() => drop.remove(), 620);
    }
}

function showCombo() {
    comboBadge.textContent = "x" + combo.toFixed(2).replace(/\.?0+$/, "");
    comboBadge.classList.toggle("on", combo > 1);

    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => {
        combo = 1;
        comboBadge.classList.remove("on");
    }, COMBO_WINDOW);
}

function pick(event) {
    if (!event.isTrusted) return;

    const now = performance.now();
    if (now - lastClick < MIN_CLICK_GAP) return;

    combo =
        now - lastClick < COMBO_WINDOW
            ? Math.min(COMBO_MAX, combo + COMBO_STEP)
            : 1;

    lastClick = now;

    const gain = clickPower() * combo;

    state.clicks++;
    earn(gain);

    const rect = orchard.getBoundingClientRect();
    pop(event.clientX - rect.left, event.clientY - rect.top, gain);

    mangoButton.classList.add("squish");
    setTimeout(() => mangoButton.classList.remove("squish"), 90);

    showCombo();
    render();
}

function buy(upgrade) {
    const cost = costOf(upgrade);
    if (state.mangos < cost) return;

    state.mangos -= cost;
    state[upgrade.id]++;

    setStatus(upgrade.name + " bought.");
    render();
    save();
}

function buildUpgrades() {
    for (const upgrade of UPGRADES) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "upgrade";
        button.dataset.id = upgrade.id;
        button.innerHTML = `
            <span class="upgrade-top">
                <span class="upgrade-name"></span>
                <span class="upgrade-cost"></span>
            </span>
            <span class="upgrade-desc"></span>
            <span class="upgrade-owned"></span>
        `;

        button.querySelector(".upgrade-name").textContent = upgrade.name;
        button.querySelector(".upgrade-desc").textContent = upgrade.desc;
        button.addEventListener("click", () => buy(upgrade));

        upgradeList.appendChild(button);
    }
}

function render() {
    display.score.textContent = format(state.mangos);
    display.power.textContent = clickPower().toFixed(
        clickPower() % 1 === 0 ? 0 : 1,
    );
    display.perSec.textContent = perSecond().toFixed(1);
    display.lifetime.textContent = format(state.lifetime);
    display.clicks.textContent = state.clicks.toLocaleString();
    display.tokens.textContent = state.tokensPaid.toLocaleString();

    const progress = (state.lifetime % MANGOS_PER_TOKEN) / MANGOS_PER_TOKEN;
    tokenFill.style.width = progress * 100 + "%";

    for (const upgrade of UPGRADES) {
        const button = upgradeList.querySelector(`[data-id="${upgrade.id}"]`);
        const cost = costOf(upgrade);
        const owned = state[upgrade.id];

        button.disabled = state.mangos < cost;
        button.querySelector(".upgrade-cost").textContent = format(cost) + " 🥭";
        button.querySelector(".upgrade-owned").textContent =
            owned > 0 ? `owned ${owned}` : "";
    }
}

async function save() {
    const payload = JSON.stringify(state);

    if (storage) {
        await storage.set({ [SAVE_KEY]: payload });
        return;
    }

    try {
        localStorage.setItem(SAVE_KEY, payload);
    } catch {
        /* private mode — the run just stays unsaved */
    }
}

async function load() {
    let payload = null;

    if (storage) {
        const saved = await storage.get(SAVE_KEY);
        payload = saved[SAVE_KEY] ?? null;
    } else {
        try {
            payload = localStorage.getItem(SAVE_KEY);
        } catch {
            payload = null;
        }
    }

    if (typeof payload !== "string") return;

    try {
        const parsed = JSON.parse(payload);

        for (const key of Object.keys(state)) {
            if (typeof parsed[key] === "number" && Number.isFinite(parsed[key])) {
                state[key] = Math.max(0, parsed[key]);
            }
        }
    } catch {
        /* corrupt save — start fresh rather than crash the page */
    }
}

let lastTick = performance.now();

function tick(now) {
    const delta = (now - lastTick) / 1000;
    lastTick = now;

    const passive = perSecond() * delta;
    if (passive > 0) {
        earn(passive);
        render();
    }

    requestAnimationFrame(tick);
}

// The inline SVG is the fallback. Drop a Figma export at images/mango.png and
// it takes over on its own — no markup change needed. A missing file just
// leaves the SVG in place.
function useFigmaArt() {
    const art = new Image();

    art.addEventListener("load", () => {
        art.alt = "";
        mangoButton.replaceChildren(art);
    });

    art.src = "../images/mango.png";
}

mangoButton.addEventListener("pointerdown", pick);
mangoButton.addEventListener("dragstart", (event) => event.preventDefault());
mangoButton.addEventListener("contextmenu", (event) => event.preventDefault());

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
});

setInterval(save, 5000);

buildUpgrades();
useFigmaArt();

load().then(() => {
    render();
    lastTick = performance.now();
    requestAnimationFrame(tick);
});
