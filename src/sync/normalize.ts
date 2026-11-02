function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isRecommendable(url: string): boolean {
  const protocol = parse(url)?.protocol;
  return protocol === 'http:' || protocol === 'https:';
}

/** The key that makes two saved copies of a page count as one item. */
export function normalizeUrl(url: string): string {
  const parsed = parse(url);
  if (!parsed || !isRecommendable(url)) return url;
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.protocol}//${parsed.host}${path}${parsed.search}${parsed.hash}`;
}

export function displayDomain(url: string): string {
  return parse(url)?.hostname.replace(/^www\./, '') || url;
}
