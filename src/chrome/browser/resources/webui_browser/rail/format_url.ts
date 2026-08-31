export function formatDisplayUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return url;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  return parsed.port ? `${host}:${parsed.port}` : host;
}
