/*
 * The punishment registry.
 *
 * ADDING A PUNISHMENT
 * -------------------
 * 1. Copy any file in this folder and edit it.
 * 2. Import it below and drop it in the PUNISHMENTS array.
 *
 * Have to use plain js here, the content script needs to be able to import it.
 */

import { arepaRain } from "./arepa-rain.js";
import { bankQueue } from "./bank-queue.js";
import { mangoHarvest } from "./mango-harvest.js";
import { adInvasion } from "./ad-invasion.js";
import { capybaraTracks } from "./capybara-tracks.js";

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
 *   reloads the page.
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
export const PUNISHMENTS = [
  arepaRain,
  mangoHarvest,
  bankQueue,
  adInvasion,
  capybaraTracks,
];

/**
 * Self explanatory.
 *
 * @type {Record<string, string>}
 */
const RENAMED_IDS = {
  "capybara-wash": "capybara-tracks",
};

/**
 * Looks up a punishment by id, including any renamed ids.
 *
 * @param {unknown} id
 * @returns {Punishment | undefined}
 */
export function findPunishmentById(id) {
  const wanted = typeof id === "string" ? (RENAMED_IDS[id] ?? id) : id;

  return PUNISHMENTS.find((punishment) => punishment.id === wanted);
}

/**
 * @param {unknown} id
 * @returns {Punishment}
 */
export function getPunishmentById(id) {
  return findPunishmentById(id) ?? PUNISHMENTS[0];
}
