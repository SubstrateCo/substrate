import {
  organizationInvitationMessage,
  resetPasswordMessage,
  sharingInvitationMessage,
  verifyEmailMessage,
} from "../src/mail/messages";
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const origins = { webURL: "https://app.example.com", apiURL: "https://api.example.com" };
const output = resolve(import.meta.dir, "../../../.runtime/mail-previews");
const invitation = { id: "preview-invitation", organizationName: "Acme Studio" };
const previews = [
  {
    name: "verify-email",
    message: await verifyEmailMessage(
      `${origins.apiURL}/api/auth/verify-email?token=preview-token`,
      origins,
    ),
    action: "Verify email address",
    url: `${origins.webURL}/api/auth/verify-email?token=preview-token`,
  },
  {
    name: "reset-password",
    message: await resetPasswordMessage(
      `${origins.apiURL}/api/auth/reset-password/preview-token`,
      origins,
    ),
    action: "Reset password",
    url: `${origins.webURL}/api/auth/reset-password/preview-token`,
  },
  {
    name: "workspace-invitation",
    message: await organizationInvitationMessage(invitation, origins),
    action: "Accept invitation",
    url: `${origins.webURL}/accept-invitation/${invitation.id}`,
  },
  {
    name: "conversation-invitation",
    message: await sharingInvitationMessage(
      { ...invitation, conversationName: "Website launch" },
      origins,
    ),
    action: "Review invitation",
    url: `${origins.apiURL}/desktop/open?path=%2Faccept-sharing%2F${invitation.id}`,
  },
  {
    name: "conversation-unnamed",
    message: await sharingInvitationMessage({ ...invitation, conversationName: null }, origins),
    action: "Review invitation",
    url: `${origins.apiURL}/desktop/open?path=%2Faccept-sharing%2F${invitation.id}`,
  },
  {
    name: "conversation-long-names",
    message: await sharingInvitationMessage(
      {
        ...invitation,
        organizationName: "Acme Research & Development <Partner Operations>",
        conversationName:
          "International launch planning / product, design & engineering — November",
      },
      origins,
    ),
    action: "Review invitation",
    url: `${origins.apiURL}/desktop/open?path=%2Faccept-sharing%2F${invitation.id}`,
  },
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const preview of previews) {
    await Bun.write(resolve(output, `${preview.name}.html`), preview.message.html);
    await Bun.write(resolve(output, `${preview.name}.txt`), preview.message.text);
    for (const mode of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: mode });
      for (const [size, width] of [
        ["desktop", 800],
        ["mobile", 375],
      ] as const) {
        await page.setViewportSize({ width, height: 600 });
        await page.setContent(preview.message.html);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
        expect(
          heading!.width,
          `${preview.name} must leave enough reading width`,
        ).toBeGreaterThanOrEqual(Math.min(width - 100, 460));
        await expect(page.getByRole("link", { name: preview.action, exact: true })).toHaveAttribute(
          "href",
          preview.url,
        );
        await expect(page.locator("body")).toHaveCSS(
          "background-color",
          mode === "dark" ? "rgb(16, 17, 23)" : "rgb(246, 247, 248)",
        );
        await expect(page.locator("body > table > tbody > tr > td")).toHaveCSS(
          "background-color",
          mode === "dark" ? "rgb(16, 17, 23)" : "rgb(246, 247, 248)",
        );
        await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
          "color",
          mode === "dark" ? "rgb(223, 225, 231)" : "rgb(32, 33, 38)",
        );
        await expect(page.getByRole("link", { name: preview.action, exact: true })).toHaveCSS(
          "background-color",
          mode === "dark" ? "rgb(162, 168, 252)" : "rgb(82, 72, 199)",
        );
        await expect(page.getByRole("link", { name: preview.action, exact: true })).toHaveCSS(
          "color",
          mode === "dark" ? "rgb(19, 20, 40)" : "rgb(250, 250, 250)",
        );
        if (preview.name.startsWith("conversation")) {
          await expect(
            page.getByText("Accepting shares the full conversation history.", { exact: true }),
          ).toBeVisible();
        }
        if (preview.name === "conversation-unnamed") {
          await expect(page.getByText("A conversation", { exact: true })).toBeVisible();
        }
        if (preview.name === "conversation-long-names") {
          await expect(
            page.getByText(
              "Acme Research & Development <Partner Operations> has invited you to collaborate in a shared conversation on Substrate.",
              { exact: true },
            ),
          ).toBeVisible();
        }
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflows, `${preview.name} must fit ${size}`).toBe(false);
        await page.screenshot({
          path: resolve(output, `${preview.name}-${size}${mode === "dark" ? "-dark" : ""}.png`),
          fullPage: true,
        });
      }
    }
  }
} finally {
  await browser.close();
}
console.log(
  `Rendered and checked ${previews.length} emails in light and dark mode at desktop and mobile widths: ${output}`,
);
