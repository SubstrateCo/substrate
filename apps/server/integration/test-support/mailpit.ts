import { mailpitURL } from "./environment";
import { expect, type APIRequestContext } from "@playwright/test";

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

export class Mailpit {
  private readonly baseURL = mailpitURL;

  constructor(private readonly request: APIRequestContext) {}

  private async messages(recipient: string): Promise<MailpitMessage[]> {
    const response = await this.request.get(`${this.baseURL}/api/v1/search`, {
      params: { query: `to:${recipient}`, limit: 50 },
    });
    if (!response.ok()) throw new Error(`Mailpit search failed (${response.status()}).`);
    const body: { messages: MailpitMessage[] } = await response.json();
    return body.messages.filter((candidate) =>
      candidate.To.some((to) => to.Address.toLowerCase() === recipient.toLowerCase()),
    );
  }

  async messageIds(recipient: string): Promise<string[]> {
    return (await this.messages(recipient)).map((message) => message.ID);
  }

  async link(
    recipient: string,
    subject: string,
    pathname: string,
    previousIds: readonly string[] = [],
  ): Promise<string> {
    let message: MailpitMessage | undefined;
    await expect
      .poll(
        async () => {
          message = (await this.messages(recipient)).find(
            (candidate) => candidate.Subject === subject && !previousIds.includes(candidate.ID),
          );
          return Boolean(message);
        },
        { message: `Email with subject "${subject}" reaches its test recipient`, timeout: 30_000 },
      )
      .toBe(true);

    const response = await this.request.get(`${this.baseURL}/api/v1/message/${message!.ID}`);
    if (!response.ok()) throw new Error(`Mailpit message fetch failed (${response.status()}).`);
    const body: { Text: string } = await response.json();
    const links = body.Text.match(/https?:\/\/[^\s<>"']+/g) ?? [];
    const link = links.find((value) => new URL(value).pathname.startsWith(pathname));
    if (!link) throw new Error("The email did not contain the expected application link.");
    return link;
  }
}
