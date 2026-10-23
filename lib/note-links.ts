const WEB_LINK =
  /https?:\/\/[^\s<>"']+|(?:www\.)?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:[/?#][^\s<>"']*)?/giu;

export function noteLinkRanges(text: string) {
  const links: { from: number; to: number; label: string; url: string }[] = [];
  for (const match of text.matchAll(WEB_LINK)) {
    const from = match.index ?? 0;
    const before = text[from - 1];
    if (before && /[\p{L}\p{N}@._-]/u.test(before)) continue;
    if (text[from + match[0].length] === '@') continue;
    const label = match[0].replace(/[),.;!?]+$/, '');
    try {
      const url = new URL(
        /^https?:\/\//i.test(label) ? label : `https://${label}`,
      );
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (!/^https?:\/\//i.test(label)) {
        const labels = url.hostname.split('.');
        const suffix = labels.at(-1)!;
        if (
          !/^(?:[\p{L}]{2,}|xn--[a-z0-9-]+)$/iu.test(suffix) ||
          labels.some(
            (part) =>
              !/^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u.test(part),
          )
        )
          continue;
      }
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
