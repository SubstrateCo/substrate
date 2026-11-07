import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { provisionWorkspaceSession } from "../../../web/e2e/test-support/organizations.js";
import { test } from "../test-support/fixture.js";
import { expect, type Locator, type Page } from "@playwright/test";

async function fitsWindow(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  await locator.evaluate((element) =>
    element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" }),
  );
  const bounds = await locator.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
  const clippedBy = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const clipped: string[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const box = parent.getBoundingClientRect();
      const left = box.left + parent.clientLeft;
      const top = box.top + parent.clientTop;
      const clipsX = /auto|scroll|hidden|clip/.test(style.overflowX);
      const clipsY = /auto|scroll|hidden|clip/.test(style.overflowY);
      if (
        (clipsX && (bounds.left < left - 1 || bounds.right > left + parent.clientWidth + 1)) ||
        (clipsY && (bounds.top < top - 1 || bounds.bottom > top + parent.clientHeight + 1))
      ) {
        clipped.push(`${parent.tagName}: ${parent.getAttribute("aria-label") ?? parent.className}`);
      }
    }
    return clipped;
  });
  expect(clippedBy, "The control fits inside every clipping or scrolling panel").toEqual([]);
}

test("Incoming invitation pagination survives expiry updates in Electron", async ({
  desktop,
  browser,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  await desktop.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(320, 568);
  });
  await page.clock.install();
  const other = await browser.newContext({ baseURL: desktop.rendererOrigin });
  try {
    await provisionVerifiedAccount({ request: other.request }, desktop.mailpit, desktop.member);
    for (let index = 0; index < 11; index++) {
      const organization = await provisionWorkspaceSession(
        other.request,
        `Incoming ${index}`,
        `incoming-${index}-${desktop.suffix}`,
      );
      const invited = await other.request.post("/api/auth/organization/invite-member", {
        headers: { origin: desktop.rendererOrigin },
        data: { organizationId: organization.id, email: desktop.owner.email, role: "member" },
      });
      expect(invited.ok()).toBe(true);
    }
    await desktop.openPath("/settings/user/invitations");
    const pagination = page.getByRole("navigation", {
      name: "Your invitations pagination",
      exact: true,
    });
    const next = pagination.getByRole("button", { name: "Go to next page", exact: true });
    await next.click();
    await expect(next).toBeDisabled();
    await page.clock.runFor(2100);
    await expect(next).toBeDisabled();
    await expect(
      pagination.getByRole("button", { name: "Go to previous page", exact: true }),
    ).toBeEnabled();
  } finally {
    await other.close();
  }
});

for (const size of [
  { width: 1024, height: 768 },
  { width: 700, height: 768 },
  { width: 375, height: 812 },
  { width: 320, height: 812 },
  { width: 320, height: 568 },
]) {
  test(`Electron settings, invitations and picture controls fit ${size.width}x${size.height}`, async ({
    desktop,
    browser,
  }) => {
    test.setTimeout(120_000);
    await desktop.app.evaluate(({ BrowserWindow }, dimensions) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setMinimumSize(0, 0);
      window.setContentSize(dimensions.width, dimensions.height);
    }, size);
    const page = desktop.page;
    await expect
      .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      .toEqual(size);
    await fitsWindow(page.getByRole("button", { name: "Sign in with browser", exact: true }), page);
    await page.screenshot({ path: test.info().outputPath("sign-in.png") });
    await desktop.provision();
    await page.clock.install();

    const organizationResponse = await desktop.browser.request.get(
      "/api/auth/organization/get-full-organization",
    );
    expect(organizationResponse.ok()).toBe(true);
    const organization: { id: string } = await organizationResponse.json();
    for (let index = 0; index < 11; index++) {
      const response = await desktop.browser.request.post("/api/auth/organization/invite-member", {
        headers: { origin: desktop.rendererOrigin },
        data: {
          organizationId: organization.id,
          email: `responsive-${index}-${desktop.suffix}@example.test`,
          role: "member",
        },
      });
      expect(response.ok(), "Seed invitations for real pagination").toBe(true);
    }

    await desktop.openPath("/settings/organization");
    await expect(
      page.getByRole("heading", { name: "Organization settings", exact: true }),
    ).toBeVisible();
    await fitsWindow(page.getByRole("button", { name: "Send invitation", exact: true }), page);
    await page.getByRole("combobox", { name: "Role", exact: true }).click();
    await fitsWindow(page.getByRole("option", { name: "Admin", exact: true }), page);
    await page.getByRole("option", { name: "Admin", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(`new-${desktop.suffix}@example.test`);
    await page.getByRole("button", { name: "Send invitation", exact: true }).click();
    await expect(page.getByText("Invitation email sent.", { exact: true })).toBeVisible();

    const invitations = page
      .getByRole("list", { name: "Invitations", exact: true })
      .or(page.getByRole("table", { name: "Invitations", exact: true }));
    await expect(invitations).toBeVisible();
    if (size.width === 700)
      await expect(page.getByRole("list", { name: "Invitations", exact: true })).toBeVisible();
    expect(
      await invitations.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          element.scrollWidth <= element.clientWidth + 1
        );
      }),
      "Invitation data fits its available width; long lists can scroll vertically",
    ).toBe(true);
    await fitsWindow(
      invitations.getByRole("group", { name: "Invitation actions", exact: true }).first(),
      page,
    );
    const resend = invitations.getByRole("button", { name: "Resend", exact: true }).first();
    const cancel = invitations.getByRole("button", { name: "Cancel", exact: true }).first();
    await expect(resend).toHaveAttribute("data-size", "icon");
    await expect(cancel).toHaveAttribute("data-size", "icon");
    await expect(cancel).toHaveAttribute("data-variant", "destructive");
    await expect(resend).toHaveText("");
    await expect(cancel).toHaveText("");
    const actionEdges = await invitations
      .getByRole("group", { name: "Invitation actions", exact: true })
      .first()
      .evaluate((group) =>
        Array.from(group.querySelectorAll("button"), (button, index) => {
          const bounds = button.getBoundingClientRect();
          const style = getComputedStyle(button);
          return {
            width: bounds.width,
            height: bounds.height,
            top: bounds.top,
            borderTop: style.borderTop,
            borderRight: style.borderRight,
            borderBottom: style.borderBottom,
            outerCorner: index === 0 ? style.borderTopLeftRadius : style.borderTopRightRadius,
          };
        }),
      );
    expect(
      actionEdges[1],
      "Grouped actions have matching bounds and visible outer border edges",
    ).toEqual(actionEdges[0]);
    await invitations
      .getByRole("group", { name: "Invitation actions", exact: true })
      .first()
      .screenshot({ path: test.info().outputPath("invitation-action-group.png") });
    await resend.focus();
    await expect(
      page.getByRole("tooltip", { name: "Resend invitation", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("tooltip", { name: "Resend invitation", exact: true, includeHidden: true }),
    ).toHaveCount(0);
    await fitsWindow(
      invitations.getByRole("button", { name: "Resend", exact: true }).first(),
      page,
    );
    await fitsWindow(
      invitations.getByRole("button", { name: "Cancel", exact: true }).first(),
      page,
    );
    await page.screenshot({ path: test.info().outputPath("invitations.png") });
    const firstPage = await invitations.innerText();
    const pagination = page.getByRole("navigation", {
      name: "Invitations pagination",
      exact: true,
    });
    await pagination.getByRole("button", { name: "Go to next page", exact: true }).click();
    await expect(invitations).not.toHaveText(firstPage);
    await expect(
      pagination.getByRole("button", { name: "Go to next page", exact: true }),
    ).toBeDisabled();
    // Expiry labels update every second; those updates must not reset the selected page.
    await page.clock.runFor(2100);
    await expect(
      pagination.getByRole("button", { name: "Go to next page", exact: true }),
    ).toBeDisabled();
    await fitsWindow(
      pagination.getByRole("button", { name: "Go to previous page", exact: true }),
      page,
    );
    await fitsWindow(
      pagination.getByRole("button", { name: "Go to next page", exact: true }),
      page,
    );
    await page.screenshot({ path: test.info().outputPath("pagination.png") });
    const previousBounds = await pagination
      .getByRole("button", { name: "Go to previous page", exact: true })
      .boundingBox();
    const nextBounds = await pagination
      .getByRole("button", { name: "Go to next page", exact: true })
      .boundingBox();
    expect(previousBounds!.y).toBe(nextBounds!.y);
    await pagination.getByRole("button", { name: "Go to previous page", exact: true }).click();
    await expect(
      pagination.getByRole("button", { name: "Go to previous page", exact: true }),
    ).toBeDisabled();
    const canceledRow = invitations
      .getByRole("listitem")
      .or(invitations.getByRole("row"))
      .filter({ has: page.getByRole("button", { name: "Cancel", exact: true }) })
      .first();
    const cancellation = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/auth/organization/cancel-invitation" &&
        response.request().method() === "POST",
    );
    await canceledRow.getByRole("button", { name: "Cancel", exact: true }).click();
    const canceled = await cancellation;
    expect(canceled.ok()).toBe(true);
    expect(await canceled.json()).toMatchObject({ status: "canceled" });
    await expect(page.getByText("Invitation canceled.", { exact: true })).toBeVisible();
    await expect(page.getByText("Invitation email sent.", { exact: true })).toHaveCount(0);
    await invitations.getByRole("button", { name: "Resend", exact: true }).first().click();
    await expect(page.getByText("Invitation email sent.", { exact: true })).toBeVisible();
    await expect(page.getByText("Invitation canceled.", { exact: true })).toHaveCount(0);

    for (const kind of ["organization", "user"] as const) {
      await desktop.openPath(`/settings/${kind}`);
      const name = kind === "user" ? "Profile picture" : "Organization logo";
      const region = page.getByRole("region", { name, exact: true });
      await fitsWindow(region.getByRole("button", { name: "Choose picture", exact: true }), page);
      const image = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        canvas.getContext("2d")!.fillRect(0, 0, 320, 180);
        return canvas.toDataURL("image/png").split(",")[1]!;
      });
      await region.getByLabel("Choose picture", { exact: true }).setInputFiles({
        name: "responsive.png",
        mimeType: "image/png",
        buffer: Buffer.from(image, "base64"),
      });
      const crop = page.getByRole("dialog", { name: `Edit ${name.toLowerCase()}`, exact: true });
      await fitsWindow(crop, page);
      await fitsWindow(crop.getByRole("group", { name: "Image crop preview", exact: true }), page);
      await crop.getByRole("button", { name: "Rotate 90°", exact: true }).click();
      if (kind === "organization") {
        await crop.getByRole("button", { name: "Fill square", exact: true }).click();
      }
      await crop.getByRole("slider", { name: "Zoom", exact: true }).press("End");
      await expect(crop.getByRole("button", { name: "Save picture", exact: true })).toBeEnabled();
      await fitsWindow(crop.getByRole("button", { name: "Save picture", exact: true }), page);
      await page.screenshot({ path: test.info().outputPath(`${kind}-crop.png`) });
      await crop.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(crop).toBeHidden();
      await expect(
        region.getByRole("button", { name: "Choose picture", exact: true }),
      ).toBeFocused();
      await expect(region.getByRole("img", { name, exact: true })).toHaveCount(0);
      await region.getByLabel("Choose picture", { exact: true }).setInputFiles({
        name: "responsive.png",
        mimeType: "image/png",
        buffer: Buffer.from(image, "base64"),
      });
      await crop.getByRole("button", { name: "Save picture", exact: true }).click();
      await expect(crop).toBeHidden();
      const saved = region.getByRole("img", { name, exact: true });
      await expect
        .poll(() =>
          saved.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 512),
        )
        .toBe(true);
      const remove = region.getByRole("button", { name: "Remove picture", exact: true });
      await expect(remove).toHaveAttribute("data-variant", "destructive");
      await fitsWindow(remove, page);
      await page.screenshot({ path: test.info().outputPath(`${kind}-picture.png`) });
      await remove.click();
      await expect(saved).toHaveCount(0);
    }
    const navigation = page.getByRole("navigation", { name: "User settings", exact: true });
    for (const link of await navigation.getByRole("link").all()) await fitsWindow(link, page);
    await page.screenshot({ path: test.info().outputPath("profile.png") });
    await navigation.getByRole("link", { name: "Invitations", exact: true }).click();
    await expect(
      page.getByText("You have no pending invitations.", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    const other = await browser.newContext({ baseURL: desktop.rendererOrigin });
    try {
      await provisionVerifiedAccount({ request: other.request }, desktop.mailpit, desktop.member);
      const name = `Responsive${"Workspace".repeat(8)}`;
      const invitedWorkspace = await provisionWorkspaceSession(
        other.request,
        name,
        `invited-${desktop.suffix}`,
      );
      const response = await other.request.post("/api/auth/organization/invite-member", {
        headers: { origin: desktop.rendererOrigin },
        data: { organizationId: invitedWorkspace.id, email: desktop.owner.email, role: "member" },
      });
      expect(response.ok()).toBe(true);
      await page.reload();
      const review = page
        .getByRole("link", { name: "Review invitation", exact: true })
        .filter({ visible: true });
      await fitsWindow(review, page);
      await expect(review).toHaveAttribute("data-size", "icon");
      await expect(review).toHaveText("");
      await page.screenshot({ path: test.info().outputPath("incoming-invitation.png") });
      await review.click();
      await expect(
        page.getByRole("heading", { name: "Join your team", exact: true }),
      ).toBeVisible();
      const accept = page.getByRole("button", { name: "Accept invitation", exact: true });
      await fitsWindow(accept, page);
      await page.screenshot({ path: test.info().outputPath("accept-invitation.png") });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await accept.click();
      await expect(page.getByRole("button", { name: `${name} ▾`, exact: true })).toBeVisible();
    } finally {
      await other.close();
    }
    await desktop.openPath("/organizations");
    await expect(page.getByRole("heading", { name: "Your workspaces", exact: true })).toBeVisible();
    if (size.width < 640) {
      const heading = await page
        .getByRole("heading", { name: "Your workspaces", exact: true })
        .boundingBox();
      const appearance = await page
        .getByRole("button", { name: "Color theme", exact: true })
        .boundingBox();
      expect(heading!.y).toBeGreaterThanOrEqual(appearance!.y + appearance!.height);
    }
    await fitsWindow(
      page.getByRole("button", { name: `Responsive${"Workspace".repeat(8)}`, exact: true }),
      page,
    );
    await fitsWindow(page.getByLabel("Workspace name", { exact: true }), page);
    await page.getByLabel("Workspace name", { exact: true }).fill(`Responsive ${size.width}`);
    await page.getByLabel("Workspace slug", { exact: true }).fill(`created-${desktop.suffix}`);
    const create = page.getByRole("button", { name: "Create workspace", exact: true });
    await create.scrollIntoViewIfNeeded();
    await fitsWindow(create, page);
    await page.screenshot({ path: test.info().outputPath("workspace-creation.png") });
    await create.click();
    await expect(
      page.getByRole("button", { name: `Responsive ${size.width} ▾`, exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
