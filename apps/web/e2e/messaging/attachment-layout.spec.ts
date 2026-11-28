import { conversation, post, test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { expect, type Locator, type Page } from "@playwright/test";

async function historyLayout(page: Page, log: Locator) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return log.evaluate((node) => {
    const viewport = node.getBoundingClientRect();
    const last = Array.from(node.querySelectorAll("article")).at(-1)!.getBoundingClientRect();
    return {
      top: viewport.top,
      bottom: viewport.bottom,
      width: viewport.width,
      scrollTop: node.scrollTop,
      lastTop: last.top,
      lastBottom: last.bottom,
      lastWidth: last.width,
    };
  });
}

for (const destination of ["channel", "thread"] as const) {
  for (const width of destination === "thread" ? [1440, 1100, 640] : [1440]) {
    test(`${destination} attachments at ${width}px grow above stable message history in a compact bounded editor rail`, async ({
      actors,
      client,
    }) => {
      test.setTimeout(60_000);
      const channel = await conversation(actors.sender);
      const root = await post<{ id: string }>(actors.sender, "messaging/messages", {
        conversationId: channel.id,
        body: "Attachment layout thread",
      });
      for (let index = 0; index < 24; index++)
        await post(actors.sender, "messaging/messages", {
          conversationId: channel.id,
          threadId: destination === "thread" ? root.id : undefined,
          body: `Stable history ${index}: message text must not move when files are selected.`,
        });
      const sender = await client(actors.sender);
      const { page } = sender;
      await page.setViewportSize({ width, height: 900 });
      await visit(sender, channel.id);
      if (destination === "thread") {
        await page
          .getByRole("article")
          .filter({ hasText: "Attachment layout thread" })
          .getByRole("button", { name: /^24 replies(?:, \d+ new)?$/ })
          .click();
      }
      const scope =
        destination === "thread"
          ? page.getByRole("complementary", { name: "Thread", exact: true })
          : page;
      const log = scope.getByRole("log", { name: "Messages", exact: true });
      await expect(log.getByText(/^Stable history 23:/)).toBeVisible();
      await expect
        .poll(() => log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight))
        .toBeLessThan(2);
      const zone = scope.getByRole("region", { name: "Message attachments", exact: true });
      const group = zone.locator('[data-slot="input-group"]');
      const editor = zone.getByRole("textbox");
      const draft = [
        "Here’s the launch review for Thursday.",
        "The revised dashboard is attached.",
        "Please check the totals and leave feedback.",
        "I’ll fold in your notes before the team review.",
      ].join("\n");
      await editor.fill(draft);
      const baseline = await historyLayout(page, log);
      const initialComposer = (await group.boundingBox())!;
      const encoded = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#f3f5f8";
        context.fillRect(0, 0, 640, 360);
        context.fillStyle = "#182b42";
        context.fillRect(0, 0, 640, 52);
        context.fillStyle = "#ffffff";
        context.font = "bold 20px sans-serif";
        context.fillText("Launch dashboard", 24, 34);
        for (const [index, label] of [
          "Active teams",
          "Tasks completed",
          "Weekly sign-ins",
        ].entries()) {
          const left = 24 + index * 204;
          context.fillStyle = "#ffffff";
          context.fillRect(left, 72, 184, 84);
          context.fillStyle = "#526278";
          context.font = "14px sans-serif";
          context.fillText(label, left + 12, 96);
          context.fillStyle = "#182b42";
          context.font = "bold 26px sans-serif";
          context.fillText(["24", "186", "92%"][index]!, left + 12, 132);
        }
        context.fillStyle = "#ffffff";
        context.fillRect(24, 176, 592, 160);
        context.fillStyle = "#526278";
        context.font = "14px sans-serif";
        context.fillText("Team activity · last 7 days", 40, 200);
        for (const [index, height] of [36, 48, 42, 70, 64, 86, 94].entries()) {
          context.fillStyle = "#446cb3";
          context.fillRect(48 + index * 78, 316 - height, 48, height);
        }
        return canvas.toDataURL("image/png").split(",")[1]!;
      });
      const input = zone.getByLabel("Choose attachment files");
      await input.setInputFiles({
        name: "launch-dashboard.png",
        mimeType: "image/png",
        buffer: Buffer.from(encoded, "base64"),
      });
      const drafts = group.getByRole("list", { name: "Selected attachments", exact: true });
      const preview = drafts.getByRole("img", {
        name: "Preview of launch-dashboard.png",
        exact: true,
      });
      await expect(preview).toBeVisible();
      expect((await preview.boundingBox())!.height).toBeLessThanOrEqual(40);
      const expandedComposer = (await group.boundingBox())!;
      expect(expandedComposer.y).toBeLessThan(initialComposer.y);
      expect(expandedComposer.y + expandedComposer.height).toBe(
        initialComposer.y + initialComposer.height,
      );
      expect(await historyLayout(page, log)).toEqual(baseline);
      await drafts
        .getByRole("button", { name: "Remove launch-dashboard.png", exact: true })
        .click();
      await expect(drafts).toHaveCount(0);
      expect(await historyLayout(page, log)).toEqual(baseline);

      await input.setInputFiles({
        name: "review-notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Review notes"),
      });
      await expect(drafts.getByText("review-notes.txt", { exact: true })).toBeVisible();
      await expect(drafts.getByText("Ready to attach", { exact: true })).toHaveCount(1);
      const singleFileHeight = (await drafts.boundingBox())!.height;
      expect(singleFileHeight).toBeLessThanOrEqual(80);
      expect(await historyLayout(page, log)).toEqual(baseline);
      await drafts.getByRole("button", { name: "Remove review-notes.txt", exact: true }).click();
      await expect(drafts).toHaveCount(0);
      expect(await historyLayout(page, log)).toEqual(baseline);
      await input.setInputFiles([
        {
          name: "launch-dashboard.png",
          mimeType: "image/png",
          buffer: Buffer.from(encoded, "base64"),
        },
        {
          name: "review-notes.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Review notes"),
        },
      ]);
      await expect(drafts.getByText("Ready to attach", { exact: true })).toHaveCount(2);
      await expect(editor).toHaveText(draft, { useInnerText: true });
      await expect(editor.locator("p")).toHaveText(draft.split("\n"));
      expect(await historyLayout(page, log)).toEqual(baseline);
      await captureScreenshot(page, `${destination}-composer-attachments-${width}`, {
        fullPage: false,
      });
      await input.setInputFiles(
        Array.from({ length: 8 }, (_, index) => ({
          name: `extra-${index}.txt`,
          mimeType: "text/plain",
          buffer: Buffer.from(`Additional attachment ${index}`),
        })),
      );
      await expect(drafts.getByRole("listitem")).toHaveCount(10);
      await expect(drafts.getByText("Ready to attach", { exact: true })).toHaveCount(10);
      expect((await drafts.boundingBox())!.height).toBe(singleFileHeight);
      expect(await drafts.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
      expect(await zone.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await historyLayout(page, log)).toEqual(baseline);
      await drafts.focus();
      await drafts.press("End");
      await drafts.getByRole("button", { name: "Remove extra-7.txt", exact: true }).click();
      await expect(drafts.getByRole("listitem")).toHaveCount(9);
      expect(await historyLayout(page, log)).toEqual(baseline);
      await drafts.evaluate((node) => {
        node.scrollLeft = 0;
      });
      await expect(editor).toHaveText(draft, { useInnerText: true });
      await expect(editor.locator("p")).toHaveText(draft.split("\n"));
      const textLayout = await editor.evaluate((node) => {
        const text = document.createRange();
        text.selectNodeContents(node);
        const bounds = node.getBoundingClientRect();
        const lines = Array.from(text.getClientRects());
        return {
          visible: lines.every((line) => line.top >= bounds.top && line.bottom <= bounds.bottom),
          bottom: bounds.bottom,
          scrollable: node.scrollHeight > node.clientHeight,
        };
      });
      expect(textLayout.visible).toBe(true);
      expect(textLayout.scrollable).toBe(false);
      expect(textLayout.bottom).toBeLessThanOrEqual((await drafts.boundingBox())!.y);
      while (await drafts.getByRole("listitem").count())
        await drafts
          .getByRole("button", { name: /^Remove / })
          .first()
          .click();
      await expect(drafts).toHaveCount(0);
      expect(await historyLayout(page, log)).toEqual(baseline);
      expect(await group.boundingBox()).toEqual(initialComposer);
    });
  }
}
