function webUrl(url: string): URL|null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed :
                                                                       null;
}

export function siteOf(url: string): string {
  return webUrl(url)?.hostname.replace(/^www\./, '') ?? '';
}

export function pageFavicon(url: string): string {
  return `chrome://favicon2/?pageUrl=${
      encodeURIComponent(url)}&size=16&scaleFactor=2x`;
}

export function formatDisplayUrl(url: string): string {
  const parsed = webUrl(url);
  if (!parsed) {
    return url;
  }
  const host = siteOf(url);
  return parsed.port ? `${host}:${parsed.port}` : host;
}
