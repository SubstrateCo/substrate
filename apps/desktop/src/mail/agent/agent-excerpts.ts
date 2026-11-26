import type { McpOutput } from "@substrate/contracts/agent-tools/tools";
import { mcpOutputOffloadBytes } from "@substrate/contracts/harness-runtime";
import { mailFlag, mailboxName, type Mailbox, type MailHeader } from "@substrate/contracts/mail";

/** Count escaped JSON bytes, not UTF-16 units. Never split a surrogate pair between excerpts. */
function excerpt(text: string, budget: number) {
  let low = 0,
    high = Math.min(text.length, budget);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(JSON.stringify(text.slice(0, mid))) <= budget) low = mid;
    else high = mid - 1;
  }
  if (low < text.length && low > 0 && /[\uD800-\uDBFF]/.test(text.charAt(low - 1))) low--;
  return text.slice(0, low);
}

export const boxName = (box: Mailbox) => excerpt(mailboxName(box), 100);
export function mailSummary(box: Mailbox, m: MailHeader) {
  return {
    messageId: m.id,
    mailboxId: box.id,
    mailbox: boxName(box),
    from: excerpt(m.from, 140),
    subject: excerpt(m.subject, 180),
    date: new Date(m.timestamp).toISOString(),
    unread: !!(m.flags & mailFlag.unread),
    snippet: excerpt(m.snippet, 200),
  };
}

export function readExcerpt(
  box: Mailbox,
  m: MailHeader & { text: string; more: boolean },
  offset: number,
  coverage: "gmail" | "cached",
): McpOutput<"read_inbox_message"> {
  const { snippet: _snippet, ...header } = mailSummary(box, m);
  const result: McpOutput<"read_inbox_message"> = {
    ...header,
    to: excerpt(m.to, 200),
    coverage,
    text: "",
    truncated: false,
    nextOffset: null,
  };
  const budget = mcpOutputOffloadBytes - Buffer.byteLength(JSON.stringify(result)) - 32;
  result.text = excerpt(m.text, budget);
  result.truncated = m.more || result.text.length < m.text.length;
  result.nextOffset = result.truncated ? offset + result.text.length : null;
  return result;
}
