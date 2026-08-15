/*
 * La fila del banco: you take a ticket and you wait, like everybody else.
 * The shortest punishment in the folder — copy this one when adding your own.
 */

import { createPunishmentButton, createPunishmentPanel } from './overlay.js';

const QUEUE_LENGTH = 12;
const SECONDS_PER_TICKET = 2;

/** @param {import('./registry.js').PunishmentContext} context */
function mount(context) {
  const ticketNumber = 40 + Math.floor(Math.random() * 40);
  const panel = createPunishmentPanel({
    title: 'La fila del banco',
    subtitle: `Ticket A-${ticketNumber}. Take a seat, they will call you.`,
  });

  if (!panel) {
    return;
  }

  const button = createPunishmentButton('Waiting…');
  let ahead = QUEUE_LENGTH;

  button.disabled = true;
  // Re-appending the status moves it below the button.
  panel.panel.append(button, panel.status);
  panel.status.textContent = `${ahead} people ahead of you`;

  const interval = window.setInterval(() => {
    ahead -= 1;

    if (ahead > 0) {
      panel.status.textContent = `${ahead} ${ahead === 1 ? 'person' : 'people'} ahead of you`;
      return;
    }

    window.clearInterval(interval);
    panel.status.textContent = `Now serving A-${ticketNumber} — that's you.`;
    button.disabled = false;
    button.textContent = 'Step up to the window';
    button.focus();
  }, SECONDS_PER_TICKET * 1_000);

  button.addEventListener('click', () => {
    button.disabled = true;
    panel.status.textContent = 'Served · returning to your page…';

    void context.grantPass().catch(() => {
      panel.status.textContent = 'The teller lost your form — click again.';
      button.disabled = false;
    });
  });
}

/** @type {import('./registry.js').Punishment} */
export const bankQueue = {
  id: 'bank-queue',
  label: 'Bank queue',
  color: '#684d3a',
  textColor: '#f6e5c7',
  taunt: 'Take a ticket. The queue does not care about your plans.',
  mount,
};
