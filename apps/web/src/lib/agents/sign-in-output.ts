export type OutputSegment = { text: string; href?: string };

const urlPattern = /https?:\/\/[^\s"'<>`]+/g;
const trailing = /[.,;:!?)\]}]+$/;

export function outputSegments(text: string): OutputSegment[] {
  const segments: OutputSegment[] = [];
  let index = 0;
  for (const match of text.matchAll(urlPattern)) {
    let url = match[0];
    const tail = trailing.exec(url)?.[0] ?? "";
    const keepParen = tail.startsWith(")") && url.includes("(");
    if (tail && !keepParen) url = url.slice(0, -tail.length);
    if (!URL.canParse(url)) continue;
    if (match.index > index) segments.push({ text: text.slice(index, match.index) });
    segments.push({ text: url, href: url });
    index = match.index + url.length;
  }
  if (index < text.length) segments.push({ text: text.slice(index) });
  return segments;
}
