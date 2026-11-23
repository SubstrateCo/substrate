import type { Attachment } from "@substrate/contracts/files/attachments";
import type { CompletedUpload } from "@substrate/contracts/files/input";

import { result } from "../test-support/api";
import { appOrigin } from "../test-support/environment";
import { complete, createUpload, putBytes, root } from "../test-support/files";
import { test } from "../test-support/fixtures";
import { expect } from "@playwright/test";
import sharp from "sharp";

test("message image previews enforce access, validate bytes, and stop after deletion", async ({
  actors: { member, owner, outsider },
  request,
}) => {
  const organizationId = member.organizationId;
  const headers = { origin: appOrigin };
  const channel = await result<{ id: string }>(
    await member.request.post("/api/v1/messaging/conversations", {
      headers,
      data: { organizationId, kind: "channel", private: true, name: "Image previews" },
    }),
  );
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const attachmentFileIds: string[] = [];
  for (const bytes of [png, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')]) {
    const ticket = await createUpload(member, "file", "private-image.png", "image/png", bytes);
    await putBytes(request, ticket, bytes);
    attachmentFileIds.push((await result<CompletedUpload>(await complete(member, ticket))).fileId);
  }
  const message = await result<{ id: string }>(
    await member.request.post("/api/v1/messaging/messages", {
      headers,
      data: { organizationId, conversationId: channel.id, body: "", attachmentFileIds },
    }),
  );
  const messages = await result<{ id: string; attachments: Attachment[] }[]>(
    await member.request.get("/api/v1/messaging/messages", {
      params: { organizationId, conversationId: channel.id },
    }),
  );
  const attachments = messages.find((entry) => entry.id === message.id)!.attachments;
  const params = {
    organizationId,
    conversationId: channel.id,
    messageId: message.id,
    attachmentId: attachments[0]!.id,
  };
  const url = `${root}/attachments/messages/preview`;
  const preview = await member.request.get(url, { params });
  expect(preview.status()).toBe(200);
  expect(preview.headers()).toMatchObject({
    "content-type": "image/webp",
    "content-disposition": "inline",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  expect((await sharp(await preview.body()).metadata()).width).toBe(10);
  const download = await member.request.get(`${root}/attachments/messages/content`, { params });
  expect(download.headers()["content-disposition"]).toMatch(/^attachment/);
  expect(await download.body()).toEqual(png);
  expect(
    (
      await member.request.get(url, { params: { ...params, attachmentId: attachments[1]!.id } })
    ).status(),
  ).toBe(400);
  expect((await request.get(url, { params })).status()).toBe(401);
  for (const actor of [owner, outsider]) {
    expect(
      (
        await actor.request.get(url, {
          params: { ...params, organizationId: actor.organizationId },
        })
      ).status(),
    ).toBe(404);
  }
  await result(
    await member.request.post("/api/v1/messaging/messages/delete", {
      headers,
      data: { organizationId, messageId: message.id },
    }),
  );
  expect((await member.request.get(url, { params })).status()).toBe(404);
});
