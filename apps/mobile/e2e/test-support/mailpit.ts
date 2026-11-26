import { expect, type APIRequestContext } from "@playwright/test";

const baseURL = process.env.MAILPIT_BASE_URL ?? "http://localhost:8025";

export async function emailLink(
  request: APIRequestContext,
  email: string,
  subject: string,
  pathname: string,
) {
  let messageId = "";
  await expect
    .poll(
      async () => {
        const response = await request.get(`${baseURL}/api/v1/search`, {
          params: { query: `to:${email}`, limit: 50 },
        });
        expect(response.ok(), "Dedicated Mailpit is available").toBe(true);
        const data: {
          messages: { ID: string; Subject: string; To: { Address: string }[] }[];
        } = await response.json();
        messageId =
          data.messages.find(
            (message) =>
              message.Subject === subject &&
              message.To.some((recipient) => recipient.Address === email),
          )?.ID ?? "";
        return messageId;
      },
      { timeout: 30_000, message: `${subject} reaches the synthetic account` },
    )
    .not.toBe("");
  const mail = await request.get(`${baseURL}/api/v1/message/${messageId}`);
  expect(mail.ok()).toBe(true);
  const { Text }: { Text: string } = await mail.json();
  const link = Text.match(/https?:\/\/[^\s<>"']+/g)?.find((value) =>
    new URL(value).pathname.startsWith(pathname),
  );
  if (!link) throw new Error(`The real ${subject} email has no expected application link.`);
  return link;
}
