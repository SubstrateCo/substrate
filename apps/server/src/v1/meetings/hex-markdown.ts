import { originalInput, type MeetingPerson, type SourceInput } from "@substrate/contracts/meetings";

function clockMs(value: string) {
  if (!/^(?:\d+:[0-5]\d|\d+:[0-5]\d:[0-5]\d)$/.test(value))
    throw new Error("Invalid meeting duration or timestamp.");
  const n = value.split(":").reduce((v, p) => 60 * v + Number(p), 0) * 1000;
  if (!Number.isSafeInteger(n)) throw new Error("Invalid meeting duration.");
  return n;
}

function startFromHeader(value: string) {
  const date = value.match(
    /^(?:[A-Za-z]+,\s*)?([A-Za-z]+) (\d{1,2}), (\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  );
  if (!date) throw new Error("The Hex export needs a valid date.");
  const [, month, day, year, h, m, ampm] = date;
  const mm =
    "january february march april may june july august september october november december"
      .split(" ")
      .indexOf(month.toLowerCase()) + 1;
  const validClock = +h >= 1 && +h <= 12 && +m < 60,
    validDay = +day >= 1 && +day <= new Date(Date.UTC(+year, mm, 0)).getUTCDate();
  if (mm === 0 || !validClock || !validDay) throw new Error("The Hex export needs a valid date.");
  return `${year}-${String(mm).padStart(2, "0")}-${day.padStart(2, "0")}T${String((+h % 12) + (ampm.toUpperCase() === "PM" ? 12 : 0)).padStart(2, "0")}:${m}:00`;
}
export function readHexMarkdown(raw: string, key: string): SourceInput {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const title = text.match(/^# (.+)$/m)?.[1]?.trim();
  const meta = new Map(
    [...text.split(/^## |^<!-- hex:notes -->/m)[0].matchAll(/^- \*\*([^:]+):\*\* (.+)$/gm)].map(
      ([, k, v]) => [k, v.trim()],
    ),
  );
  const date = meta.get("Date"),
    duration = meta.get("Duration");
  if (!title || !date || !duration)
    throw new Error("Choose a Hex meeting Markdown export with a title, date, and duration.");
  const block = text.match(/<!-- hex:notes -->\s*([\s\S]*?)\s*<!-- \/hex:notes -->/)?.[1] ?? "";
  if (text.includes("<!-- hex:notes -->") && !text.includes("<!-- /hex:notes -->"))
    throw new Error("The Hex notes block is incomplete.");
  const credit = block.match(/^_Written by (.+?)_$/m)?.[1] ?? null;
  const notes =
    block
      .replace(/^## Summary\s*/, "")
      .replace(/^_Written by .+?_$/m, "")
      .trim() || null;
  const afterNotes = text.slice(Math.max(0, text.indexOf("<!-- /hex:notes -->")));
  const heading = /^## Transcript[ \t]*(?:\n|$)/m.exec(afterNotes);
  const transcript = heading
    ? afterNotes.slice(heading.index + heading[0].length).replace(/^\n+|\n+$/g, "")
    : "";
  const turns = transcript
    ? transcript.split(/\n(?=\*\*[^*\n]+\*\* · )/).map((entry) => {
        const match = entry.match(/^\*\*([^*\n]+)\*\* · (\d+(?::\d{2}){1,2})[ \t]*\n([\s\S]+)$/);
        if (!match || !match[3].trim())
          throw new Error("The Hex transcript contains an unreadable turn.");
        return {
          speaker: match[1],
          offsetMs: clockMs(match[2]),
          text: match[3].replace(/\n+$/, ""),
        };
      })
    : [];
  const people = [...new Set(turns.map((t) => t.speaker))].map((name): MeetingPerson => {
    if (name === "You") return { name, key: null, evidence: "self" };
    return { name, key: null, evidence: name === "Them" ? "unresolved" : "speaker" };
  });
  return originalInput.parse({
    key,
    nativeId: null,
    title,
    localStart: startFromHeader(date),
    startMs: null,
    durationMs: clockMs(duration),
    platform: meta.get("App") ?? null,
    occurrence: null,
    format: "markdown",
    raw,
    notes,
    credit,
    turns,
    transcriptState: turns.length ? "available" : "missing",
    people,
  });
}
