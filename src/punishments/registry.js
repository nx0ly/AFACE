/*
 * The punishment registry.
 *
 * ADDING A PUNISHMENT
 * -------------------
 * 1. Copy any file in this folder (bank-queue.js is the smallest) and edit it.
 * 2. Import it below and drop it in the PUNISHMENTS array.
 * That is the whole checklist — the Wheel of Doom draws its wedges from this
 * array, and the content script dispatches on `id`.
 *
 * Plain JS on purpose: this module is imported both by the blocked page
 * (pages/blocked.js) and by the TypeScript content script (index.ts), so the
 * import specifier has to work whether or not the bundler rewrites it. Types
 * come from the JSDoc below.
 */

import { arepaRain } from './arepa-rain.js';
import { bankQueue } from './bank-queue.js';
import { mangoHarvest } from './mango-harvest.js';
import { penanceTyping } from './penance-typing.js';
import { adInvasion } from './ad-invasion.js';
import { capybaraWash } from './capybara-wash.js';

/**
 * What a punishment gets handed when it runs. It runs inside the content
 * script, on the page the user was trying to reach.
 *
 * @typedef {object} PunishmentContext
 * @property {string} url Page the user is being punished on.
 * @property {number} duration How long the pass lasts once they survive, in ms.
 * @property {(path: string) => string} getAssetUrl Resolves a packaged asset,
 *   e.g. `getAssetUrl('images/arepa.png')`.
 * @property {() => Promise<void>} grantPass Call when the user has served their
 *   sentence. It writes the whitelist entry, clears the pending punishment and
 *   reloads the page. Never resolves on success — the page navigates away.
 */

/**
 * One wedge of the punishment wheel.
 *
 * @typedef {object} Punishment
 * @property {string} id Stored in extension storage — keep it stable.
 * @property {string} label Wedge text. Two short words fit best.
 * @property {string} color Wedge fill (any CSS color).
 * @property {string} textColor Wedge text color; pick for contrast on `color`.
 * @property {string} taunt One line announced when the wheel lands here.
 * @property {(context: PunishmentContext) => void} mount Runs the punishment.
 *   Must call `context.grantPass()` when it is over, or the site stays blocked.
 */

/** @type {Punishment[]} */
export const PUNISHMENTS = [arepaRain, mangoHarvest, bankQueue, penanceTyping, adInvasion, capybaraWash];

/**
 * @param {unknown} id
 * @returns {Punishment}
 */
export function getPunishmentById(id) {
  return PUNISHMENTS.find((punishment) => punishment.id === id) ?? PUNISHMENTS[0];
}
