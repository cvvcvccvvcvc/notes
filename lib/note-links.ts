const WEB_LINK =
  /(?:https?:\/\/)?(?:www\.)?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:[/?#][^\s<>"']*)?/giu;

export function noteLinks(text: string) {
  const links: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(WEB_LINK)) {
    const before = text[(match.index ?? 0) - 1];
    if (before && /[\p{L}\p{N}@]/u.test(before)) continue;
    const label = match[0].replace(/[),.;!?]+$/, '');
    try {
      const url = new URL(
        /^https?:\/\//i.test(label) ? label : `https://${label}`,
      );
      if (!['http:', 'https:'].includes(url.protocol) || seen.has(url.href))
        continue;
      seen.add(url.href);
      links.push({ label, url: url.href });
    } catch {
      // Ignore incomplete addresses while the note is being edited.
    }
  }
  return links;
}
