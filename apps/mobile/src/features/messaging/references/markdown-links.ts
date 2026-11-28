const openableSchemes = new Set(["http:", "https:", "mailto:"]);

export function openableLink(href: string): string | undefined {
  try {
    const url = new URL(href);
    return openableSchemes.has(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
