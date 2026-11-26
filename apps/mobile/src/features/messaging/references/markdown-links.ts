/** Schemes a message link may open. Anything else, including relative paths, stays plain text. */
const openableSchemes = new Set(["http:", "https:", "mailto:"]);

export function openableLink(href: string): string | undefined {
  try {
    const url = new URL(href);
    return openableSchemes.has(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
