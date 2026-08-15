/*
 * Arepa rain: the page is buried under a pile of arepas and you have to pop
 * every one of them. The physics lives in rain.js — this file is just the skin.
 */

import { createRainPunishment } from './rain.js';

/** @type {import('./registry.js').Punishment} */
export const arepaRain = createRainPunishment({
  id: 'arepa-rain',
  label: 'Arepa rain',
  color: '#d8943e',
  textColor: '#2f1d10',
  taunt: 'The arepas are coming for your page…',
  image: 'images/arepa.png',
  noun: 'arepa',
  particleColors: ['#f6d37a', '#d8943e', '#a9652b', '#fff0b5'],
  // Zoomed well past the box so the round crop is all crumb, no transparent edge.
  backgroundSize: '260%',
  borderRadius: '50%',
});
