/*
 * Fruit-basket avalanche: same downpour as the arepas, but it is whole baskets
 * of pineapple, guava and watermelon coming down on you.
 */

import { createRainPunishment } from './rain.js';

/** @type {import('./registry.js').Punishment} */
export const fruitBasketRain = createRainPunishment({
  id: 'fruit-basket-rain',
  label: 'Fruit baskets',
  color: '#c9527a',
  textColor: '#fff2e0',
  taunt: 'Someone tipped over the fruit stand. All of it. Onto your page.',
  image: 'images/fruit_basket.png',
  noun: 'basket',
  // Pineapple, mango-ish, guava pink and leaf green.
  particleColors: ['#f2c14e', '#e8734a', '#c9527a', '#7fa650'],
  // A basket is not a disc: fit it in the box and round the corners instead of
  // cropping it to a circle the way the arepas are.
  backgroundSize: '100%',
  borderRadius: '14%',
});
