const CONTINUE_PARAM = 'macondo_continue';
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

function isYouTubeUrl(url) {
  return (
    YOUTUBE_HOSTS.has(url.hostname) ||
    url.hostname.endsWith('.youtube.com')
  );
}

function getOriginalUrl(search) {
  const fallback = new URL('https://www.youtube.com/');
  const encodedUrl = new URLSearchParams(search).get('url');

  if (!encodedUrl) {
    return fallback;
  }

  try {
    const originalUrl = new URL(encodedUrl);
    return isYouTubeUrl(originalUrl) ? originalUrl : fallback;
  } catch {
    return fallback;
  }
}

function addContinueMarker(url) {
  const continuedUrl = new URL(url.toString());
  continuedUrl.searchParams.set(CONTINUE_PARAM, '1');
  return continuedUrl;
}

const continueButton = document.querySelector('#continue');
const originalUrl = getOriginalUrl(window.location.search);

continueButton?.addEventListener('click', () => {
  window.location.assign(addContinueMarker(originalUrl).toString());
});
