"use strict";

const TOKEN_BALANCE_KEY = "page-pause:tokens";

const cards = [
    document.getElementById("card-0"),
    document.getElementById("card-1"),
    document.getElementById("card-2"),
];
const statusLine = document.getElementById("status");
const balanceLabel = document.getElementById("balance");
const resetBtn = document.getElementById("reset-btn");

let currentBalance = 0;
let playing = true;

const OUTCOMES = [
    { type: "WIN", amount: 20, text: "WIN 20 BEANS!" },
    { type: "LOSE", amount: -50, text: "LOSE 50 BEANS!" },
    { type: "LOSE_ALL", amount: 0, text: "LOSE ALL BEANS!" },
];

function getStorage() {
    return globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
}

async function loadBalance() {
    const storage = getStorage();
    if (!storage) return;

    const saved = await storage.get(TOKEN_BALANCE_KEY);
    const value = saved[TOKEN_BALANCE_KEY];

    currentBalance = typeof value === "number" && Number.isFinite(value) ? value : 0;
    updateBalanceDisplay();
}

async function setBalance(newBalance) {
    const storage = getStorage();
    if (!storage) return;

    currentBalance = newBalance;
    updateBalanceDisplay();
    await storage.set({ [TOKEN_BALANCE_KEY]: currentBalance });
}

function updateBalanceDisplay() {
    balanceLabel.textContent = Math.floor(currentBalance).toString();
    balanceLabel.style.color = currentBalance >= 0 ? "lime" : "red";
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

let currentOutcomes = [];

function initGame() {
    playing = true;
    currentOutcomes = [...OUTCOMES];
    shuffle(currentOutcomes);

    cards.forEach((card, i) => {
        card.textContent = "?";
        card.style.backgroundColor = "#ff0000";
        card.disabled = false;
    });

    statusLine.textContent = "CHOOSE YOUR FATE...";
    statusLine.style.color = "yellow";
    resetBtn.classList.add("hidden");
}

cards.forEach((card, index) => {
    card.addEventListener("click", async () => {
        if (!playing) return;
        playing = false;

        const outcome = currentOutcomes[index];

        // Reveal the picked card
        card.textContent = outcome.type === "WIN" ? "+20" : outcome.type === "LOSE" ? "-50" : "0";
        card.style.backgroundColor = outcome.type === "WIN" ? "lime" : "black";

        // Process logic
        if (outcome.type === "WIN") {
            await setBalance(currentBalance + 20);
            statusLine.textContent = outcome.text;
            statusLine.style.color = "lime";
        } else if (outcome.type === "LOSE") {
            await setBalance(currentBalance - 50);
            statusLine.textContent = outcome.text;
            statusLine.style.color = "red";
        } else if (outcome.type === "LOSE_ALL") {
            if (currentBalance > 0) {
                await setBalance(0);
            }
            statusLine.textContent = outcome.text;
            statusLine.style.color = "red";
        }

        // Reveal other cards
        cards.forEach((otherCard, otherIndex) => {
            if (otherIndex !== index) {
                otherCard.disabled = true;
                const otherOutcome = currentOutcomes[otherIndex];
                otherCard.textContent = otherOutcome.type === "WIN" ? "+20" : otherOutcome.type === "LOSE" ? "-50" : "0";
                otherCard.style.backgroundColor = "#555555"; // dimmed
            }
        });

        resetBtn.classList.remove("hidden");
    });
});

resetBtn.addEventListener("click", initGame);

loadBalance();
initGame();
