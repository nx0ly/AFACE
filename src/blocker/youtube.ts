export const CONTINUE_PARAM = 'macondo_continue';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

export function isYouTubeUrl(url: URL): boolean {
  return (
    YOUTUBE_HOSTS.has(url.hostname) ||
    url.hostname.endsWith('.youtube.com')
  );
}

export function removeContinueMarker(url: URL): void {
  url.searchParams.delete(CONTINUE_PARAM);
}

export function addContinueMarker(url: URL): URL {
  const continuedUrl = new URL(url.toString());
  continuedUrl.searchParams.set(CONTINUE_PARAM, '1');
  return continuedUrl;
}

export function getOriginalUrl(search: string): URL {
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
