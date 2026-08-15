/*
 * La penitencia: copy the line out three times, by hand, no pasting.
 */

import { createPunishmentButton, createPunishmentPanel } from './overlay.js';

const REPETITIONS = 3;
const PHRASE = 'Macondo no se hizo en un día';

/** @param {import('./registry.js').PunishmentContext} context */
function mount(context) {
  const panel = createPunishmentPanel({
    title: 'La penitencia',
    subtitle: `Write it out ${REPETITIONS} times. Pasting does not count.`,
  });

  if (!panel) {
    return;
  }

  const phrase = document.createElement('p');
  const input = document.createElement('input');
  const button = createPunishmentButton('Submit line 1');
  let done = 0;

  phrase.className = 'page-pause-panel-phrase';
  phrase.textContent = PHRASE;
  input.className = 'page-pause-panel-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', `Type: ${PHRASE}`);
  // Copy-paste is the entire way out of this, so it is the one thing blocked.
  input.addEventListener('paste', (event) => {
    event.preventDefault();
    panel.status.textContent = 'No pasting. Type it.';
  });

  // Re-appending the status moves it below the controls.
  panel.panel.append(phrase, input, button, panel.status);
  panel.status.textContent = `0 of ${REPETITIONS} written`;
  input.focus();

  const submit = () => {
    if (input.value.trim() !== PHRASE) {
      panel.status.textContent = 'Not quite — copy it exactly, accents and all.';
      input.select();
      return;
    }

    done += 1;
    input.value = '';

    if (done < REPETITIONS) {
      panel.status.textContent = `${done} of ${REPETITIONS} written`;
      button.textContent = `Submit line ${done + 1}`;
      input.focus();
      return;
    }

    button.disabled = true;
    input.disabled = true;
    panel.status.textContent = 'Penance served · returning to your page…';

    void context.grantPass().catch(() => {
      panel.status.textContent = 'The paper tore — submit once more.';
      button.disabled = false;
      input.disabled = false;
    });
  };

  button.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
}

/** @type {import('./registry.js').Punishment} */
export const penanceTyping = {
  id: 'penance-typing',
  label: 'Penance',
  color: '#f2bf40',
  textColor: '#3b2a1a',
  taunt: 'Lines. Three of them. By hand.',
  mount,
};
