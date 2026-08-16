import { createPunishmentButton, createPunishmentPanel } from "./overlay.js";

const QUEUE_LENGTH = 60;
const SECONDS_PER_TICKET = 5;

/** @param {import('./registry.js').PunishmentContext} context */
function mount(context) {
  const ticketNumber = 40 + Math.floor(Math.random() * 40);
  const panel = createPunishmentPanel({
    title: "Fila de la EPS",
    subtitle: `Turno A-${ticketNumber}. Por favor tome asiento, lo llamaremos.`,
  });

  if (!panel) {
    return;
  }

  const button = createPunishmentButton("Waiting…");
  let ahead = QUEUE_LENGTH;

  button.disabled = true;
  panel.panel.append(button, panel.status);
  panel.status.textContent = `${ahead} people ahead of you`;

  const interval = window.setInterval(() => {
    ahead -= 1;

    if (ahead > 0) {
      panel.status.textContent = `${ahead} ${ahead === 1 ? "persona" : "personas"} delante de usted`;
      return;
    }

    window.clearInterval(interval);
    panel.status.textContent = `Now serving A-${ticketNumber} — that's you.`;
    button.disabled = false;
    button.textContent = "Step up to the window";
    button.focus();
  }, SECONDS_PER_TICKET * 1_000);

  button.addEventListener("click", () => {
    button.disabled = true;
    panel.status.textContent = "Served · returning to your page…";

    void context.grantPass().catch(() => {
      panel.status.textContent = "The teller lost your form — click again.";
      button.disabled = false;
    });
  });
}

export const bankQueue = {
  id: "bank-queue",
  label: "EPS Queue",
  color: "#c0c0c0",
  textColor: "#000000",
  taunt: "Tome un turno. A la EPS no le importa su tiempo.",
  mount,
};
