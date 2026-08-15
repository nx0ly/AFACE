"use strict";

/*
 * Adivina el número: the number is always 1, the range is always 1 to 1, and
 * you always win. It exists so tokens can be had without grinding a real game.
 */

const TOKEN_BALANCE_KEY = "page-pause:tokens";

const WINS = [
    "Correct. Uncanny.",
    "Right again. Are you cheating?",
    "Nailed it. Nobody has ever guessed that fast.",
    "Correct. This game may be broken.",
    "Yes. Truly a student of the game.",
];

const guessInput = document.getElementById("guess");
const submitButton = document.getElementById("submit");
const statusLine = document.getElementById("status");
const balanceLabel = document.getElementById("balance");

function getStorage() {
    return globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
}

async function readBalance() {
    const storage = getStorage();
    if (!storage) return 0;

    const saved = await storage.get(TOKEN_BALANCE_KEY);
    const value = saved[TOKEN_BALANCE_KEY];

    return typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0;
}

async function awardToken() {
    const storage = getStorage();
    if (!storage) return null;

    const next = (await readBalance()) + 1;
    await storage.set({ [TOKEN_BALANCE_KEY]: next });

    return next;
}

async function render() {
    balanceLabel.textContent = String(await readBalance());
}

submitButton.addEventListener("click", async () => {
    // The guess is not consulted. There is only one number.
    submitButton.disabled = true;

    const next = await awardToken();

    if (next === null) {
        statusLine.textContent = "No extension storage — token not saved.";
        submitButton.disabled = false;
        return;
    }

    statusLine.textContent =
        WINS[Math.floor(Math.random() * WINS.length)] + " +1 token.";
    balanceLabel.textContent = String(next);
    submitButton.disabled = false;
    guessInput.focus();
});

void render();
