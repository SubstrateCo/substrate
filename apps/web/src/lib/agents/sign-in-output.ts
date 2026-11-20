export type OutputSegment = { text: string; href?: string };

// http(s) URLs up to whitespace, quotes, or angle brackets.
const urlPattern = /https?:\/\/[^\s"'<>`]+/g;
/** Punctuation that usually ends a sentence, not the URL. */
const trailing = /[.,;:!?)\]}]+$/;

/**
 * Splits terminal output into text and links. Only http and https URLs become links, with
 * sentence punctuation left outside, so a sign-in page opens in the system browser.
 */
export function outputSegments(text: string): OutputSegment[] {
  const segments: OutputSegment[] = [];
  let index = 0;
  for (const match of text.matchAll(urlPattern)) {
    let url = match[0];
    const tail = trailing.exec(url)?.[0] ?? "";
    // Keep a closing parenthesis that has its opening one inside the URL.
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
