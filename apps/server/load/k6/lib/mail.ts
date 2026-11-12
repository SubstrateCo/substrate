import { trace } from "./debug.ts";
import http from "k6/http";

/**
 * The person's mail client: collaboration invitations arrive by email, and the link in it opens
 * the accept screen. The load stack's Mailpit stands in for the inbox. These reads never reach
 * the API, so they are not counted as calls.
 */

const mailpit = __ENV.MAILPIT_URL ?? "http://localhost:8026";
const idPattern = /accept-sharing(?:\/|%2F)([0-9a-f-]{36})/i;
// Mail already opened in this VU.
const opened = new Set<string>();

interface MailSummary {
  ID: string;
  Snippet: string;
  Created: string;
}

async function getJson<T>(url: string): Promise<T | null> {
  const response = await http.asyncRequest("GET", url, null, {
    tags: { name: "mailpit" },
    timeout: "10s",
  });
  if (response.status !== 200) {
    console.warn(`[vu ${__VU}] mailpit ${response.status} ${String(response.error)}`);
    return null;
  }
  return response.json() as T;
}

/** Invitation IDs from collaboration mails to `email` received in the last day and not opened yet. */
export async function unreadSharingInvitations(email: string) {
  const query = encodeURIComponent(`to:"${email}" subject:"Collaborate with"`);
  const result = await getJson<{ messages: MailSummary[] }>(
    `${mailpit}/api/v1/search?query=${query}&limit=20`,
  );
  const since = Date.now() - 86_400_000;
  const fresh = (result?.messages ?? []).filter(
    (mail) => !opened.has(mail.ID) && Date.parse(mail.Created) > since,
  );
  const ids: string[] = [];
  for (const mail of fresh) {
    opened.add(mail.ID);
    let match = mail.Snippet.match(idPattern);
    if (!match) {
      const full = await getJson<{ Text: string }>(`${mailpit}/api/v1/message/${mail.ID}`);
      match = full?.Text.match(idPattern) ?? null;
    }
    if (match) ids.push(match[1]!);
  }
  trace("mail", `${fresh.length} new invitation mails`);
  return [...new Set(ids)];
}
