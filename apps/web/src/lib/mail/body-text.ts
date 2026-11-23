/** Only absolute web links are actionable in a received email. */
export function mailHref(raw: string | null) {
  if (!raw) return undefined;
  const url = URL.parse(raw);
  return url &&
    (url.protocol === "https:" || url.protocol === "http:") &&
    !url.username &&
    !url.password
    ? url.href
    : undefined;
}

/** A built-in HTML entity decoder, applied only to individual tokens, never to sender markup. */
export function snippetText(snippet: string) {
  if (!snippet.includes("&")) return snippet;
  const decoder = document.createElement("textarea");
  return snippet.replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]*);/gi, (entity) => {
    decoder.innerHTML = entity;
    return decoder.value;
  });
}

/** Recognize a Google Meet invitation only when both meeting details and a real Meet URL exist.
 * Keep the sender's date and zone verbatim (never reinterpret them in the viewer's local zone).
 * The complete original remains available under the summary. */
export function meetingDetails(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const meet = lines
    .flatMap((line) => line.match(/https:\/\/meet\.google\.com\/[\w-]+(?:\?[^\s<>]*)?/gi) ?? [])
    .map(mailHref)
    .find((href) => href && new URL(href).hostname === "meet.google.com");
  const when = lines.findIndex(
    (line) =>
      /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i.test(
        line,
      ) && /\d(?::\d\d|[ap]m)/i.test(line),
  );
  if (
    !meet ||
    when < 0 ||
    !lines.some((line) =>
      /^(?:Join with Google Meet|Join via Google Meet|Google Meet joining info|When)\b/i.test(line),
    )
  )
    return undefined;
  const afterDate = lines[when + 1] ?? "";
  function action(name: string) {
    const index = lines.findIndex((l) => l.replace(/:$/, "").toLowerCase() === name);
    return index < 0 ? undefined : mailHref(lines[index + 1] ?? null);
  }
  return {
    meet,
    when: lines[when]!,
    zone: /\b(?:time|utc|gmt)\b|^(?:America|Europe|Asia|Africa|Pacific|Australia)\//i.test(
      afterDate,
    )
      ? afterDate
      : undefined,
    changed: lines.find((l) => /^changed:\s*.+/i.test(l)),
    reschedule: action("reschedule"),
    cancel: action("cancel"),
  };
}
