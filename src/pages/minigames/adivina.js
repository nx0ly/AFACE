"use strict"; // because WHY NOT

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
  { type: "WIN", amount: 5000000, text: "WIN 5000k BEANS!" },
  { type: "DRAW", amount: 0, text: "NOTHING HAPPENS (0)" },
  { type: "LOSE", amount: -10000, text: "LOSE 10k BEANS!" },
];

function getStorage() {
  return (
    globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local
  );
}

async function loadBalance() {
  const storage = getStorage();
  if (!storage) return;

  const saved = await storage.get(TOKEN_BALANCE_KEY);
  const value = saved[TOKEN_BALANCE_KEY];

  currentBalance =
    typeof value === "number" && Number.isFinite(value) ? value : 0;
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
    card.textContent =
      outcome.type === "WIN"
        ? "+5000k"
        : outcome.type === "LOSE"
          ? "-10k"
          : "0";
    card.style.backgroundColor =
      outcome.type === "WIN"
        ? "lime"
        : outcome.type === "DRAW"
          ? "#888"
          : "black";

    // Process logic
    if (outcome.type === "WIN") {
      await setBalance(currentBalance + 5000000);
      statusLine.textContent = outcome.text;
      statusLine.style.color = "lime";
    } else if (outcome.type === "LOSE") {
      await setBalance(currentBalance - 10000);
      statusLine.textContent = outcome.text;
      statusLine.style.color = "red";
    } else if (outcome.type === "DRAW") {
      statusLine.textContent = outcome.text;
      statusLine.style.color = "white";
    }

    // Reveal other cards
    cards.forEach((otherCard, otherIndex) => {
      if (otherIndex !== index) {
        otherCard.disabled = true;
        const otherOutcome = currentOutcomes[otherIndex];
        otherCard.textContent =
          otherOutcome.type === "WIN"
            ? "+5000k"
            : otherOutcome.type === "LOSE"
              ? "-10k"
              : "0";
        otherCard.style.backgroundColor = "#555555"; // dimmed
      }
    });

    resetBtn.classList.remove("hidden");
  });
});

resetBtn.addEventListener("click", initGame);

loadBalance();
initGame();
