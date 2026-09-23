const WEB_LINK =
  /(?:https?:\/\/)?(?:www\.)?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:[/?#][^\s<>"']*)?/giu;

export function noteLinkRanges(text: string) {
  const links: { from: number; to: number; label: string; url: string }[] = [];
  for (const match of text.matchAll(WEB_LINK)) {
    const from = match.index ?? 0;
    const before = text[from - 1];
    if (before && /[\p{L}\p{N}@]/u.test(before)) continue;
    const label = match[0].replace(/[),.;!?]+$/, '');
    try {
      const url = new URL(
        /^https?:\/\//i.test(label) ? label : `https://${label}`,
      );
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      links.push({ from, to: from + label.length, label, url: url.href });
    } catch {
      // Ignore incomplete addresses while the note is being edited.
    }
  }
  return links;
}

export function noteLinks(text: string) {
  const seen = new Set<string>();
  return noteLinkRanges(text).flatMap(({ label, url }) => {
    if (seen.has(url)) return [];
    seen.add(url);
    return [{ label, url }];
  });
}
