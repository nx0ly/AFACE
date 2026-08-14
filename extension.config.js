/** @type {import('extension').FileConfig} */
// Extension.js uses a fresh browser profile on every run for clean state.
// Prefer that default? Remove the profile config below.
const profile = (name) => `./dist/extension-profile-${name}`;

export default {
  browser: {
    chrome: { profile: profile('chrome') },
    chromium: { profile: profile('chromium') },
    edge: { profile: profile('edge') },
    firefox: { profile: profile('firefox') },
    'chromium-based': { profile: profile('chromium-based') },
    'gecko-based': { profile: profile('gecko-based') },
  },
};