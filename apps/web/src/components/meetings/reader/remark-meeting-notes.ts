import type { OriginalView } from "@substrate/contracts/meetings";

type NoteNode = {
  type: string;
  value?: string;
  children?: NoteNode[];
  ordered?: boolean;
  checked?: boolean | null;
  data?: { hName?: string; hProperties?: Record<string, string | number> };
};
const literal = new Set([
  "code",
  "inlineCode",
  "html",
  "link",
  "linkReference",
  "image",
  "imageReference",
]);

/** Enrich only supplied meeting content: ambiguous offsets stay text and only labelled lists become follow-ups. */
export function remarkMeetingNotes(turns: OriginalView["turns"]) {
  const offsets = new Map<number, number | null>();
  turns.forEach((turn, i) => {
    if (turn.offsetMs === null) return;
    const key = Math.floor(turn.offsetMs / 1000);
    offsets.set(key, offsets.has(key) ? null : i);
  });
  function inline(node: NoteNode): NoteNode[] {
    const value = node.value ?? "",
      out: NoteNode[] = [];
    let start = 0;
    for (const match of value.matchAll(/(?<!:)\b\d{1,4}(?::[0-5]\d){1,2}\b(?!:)/g)) {
      const label = match[0],
        seconds = label.split(":").reduce((n, part) => n * 60 + Number(part), 0),
        turn = offsets.get(seconds);
      if (turn == null) continue;
      if (match.index > start) out.push({ type: "text", value: value.slice(start, match.index) });
      out.push({
        type: "turnCitation",
        data: { hName: "span", hProperties: { "data-turn-index": turn } },
        children: [{ type: "text", value: label }],
      });
      start = match.index + label.length;
    }
    if (!start) return [node];
    if (start < value.length) out.push({ type: "text", value: value.slice(start) });
    return out;
  }
  function visit(node: NoteNode) {
    if (!node.children || literal.has(node.type)) return;
    node.children = node.children.flatMap((child, i, siblings) => {
      if (child.type === "text") return inline(child);
      const previous = i > 0 ? siblings[i - 1] : undefined;
      const followupHeading =
        previous?.type === "heading" &&
        /^(follow[- ]?ups?|action items|next steps)$/i.test(
          previous.children
            ?.map((part) => part.value ?? "")
            .join("")
            .trim() ?? "",
        );
      const bullets = child.type === "list" && !child.ordered ? child.children : undefined;
      // Rich and nested lists keep Markdown's block formatting and list markers.
      if (
        followupHeading &&
        bullets?.every(
          (item) =>
            item.checked == null &&
            item.children?.length === 1 &&
            item.children[0].type === "paragraph",
        )
      ) {
        child.data = { hProperties: { "data-note-list": "followups" } };
        for (const item of bullets) item.data = { hProperties: { "data-note-item": "followup" } };
      }
      visit(child);
      return [child];
    });
  }
  return visit;
}
