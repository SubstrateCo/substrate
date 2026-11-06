import { expect, test, type Locator, type Page } from "@playwright/test";

async function resetInnerScroll(control: Locator) {
  await control.evaluate((element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowY === "auto") parent.scrollTop = 0;
    }
  });
}

function creationControls(page: Page) {
  return [
    page.getByRole("textbox", { name: "Workspace name", exact: true }),
    page.getByRole("textbox", { name: "Workspace slug", exact: true }),
    page.getByRole("button", { name: "Create workspace", exact: true }),
  ];
}

async function boxes(controls: Locator[]) {
  return Promise.all(controls.map((control) => control.boundingBox()));
}

function expectStable(
  actual: Awaited<ReturnType<typeof boxes>>,
  expected: Awaited<ReturnType<typeof boxes>>,
) {
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]).not.toBeNull();
    expect(expected[index]).not.toBeNull();
    for (const dimension of ["x", "y", "width", "height"] as const) {
      expect(
        Math.abs(actual[index]![dimension] - expected[index]![dimension]),
        `Control ${index} ${dimension} stays within 1px`,
      ).toBeLessThanOrEqual(1);
    }
  }
}

for (const theme of ["light", "dark"]) {
  for (const viewport of [
    { width: 800, height: 420 },
    { width: 390, height: 700 },
  ]) {
    const suffix = `${viewport.width}x${viewport.height} in ${theme}`;
    test(`workspace action errors preserve choice and creation geometry at ${suffix}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `/iframe.html?id=scenes-workspace-selection--populated&viewMode=story&globals=theme:${theme}`,
      );
      const choice = page.getByRole("button", { name: "Launch Studio", exact: true });
      await expect(choice).toBeVisible();
      const controls = [
        choice,
        page.getByRole("button", { name: "Partner Workspace", exact: true }),
        ...creationControls(page),
      ];
      await resetInnerScroll(choice);
      const ready = await boxes(controls);
      await choice.click();
      await expect(page.getByRole("alert")).toBeVisible();
      await resetInnerScroll(choice);
      expectStable(await boxes(controls), ready);
    });

    test(`workspace loading and recovery preserve creation geometry at ${suffix}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `/iframe.html?id=scenes-workspace-selection--populated&viewMode=story&globals=theme:${theme}`,
      );
      await expect(creationControls(page)[0]!).toBeVisible();
      await resetInnerScroll(creationControls(page)[0]!);
      const ready = await boxes(creationControls(page));
      for (const story of [
        "scenes-workspace-selection--loading",
        "scenes-workspace-root-states--delayed-retry",
      ]) {
        await page.goto(`/iframe.html?id=${story}&viewMode=story&globals=theme:${theme}`);
        await expect(creationControls(page)[0]!).toBeVisible();
        await resetInnerScroll(creationControls(page)[0]!);
        expectStable(await boxes(creationControls(page)), ready);
      }
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(
        page.getByRole("status", { name: "Loading workspaces…", exact: true }),
      ).toBeVisible();
      await resetInnerScroll(creationControls(page)[0]!);
      expectStable(await boxes(creationControls(page)), ready);
      await expect(page.getByRole("button", { name: "Launch Studio", exact: true })).toBeVisible();
      await resetInnerScroll(creationControls(page)[0]!);
      expectStable(await boxes(creationControls(page)), ready);
    });

    test(`explicit workspace recovery restores visible choice focus and next Tab at ${suffix}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `/iframe.html?id=scenes-workspace-root-states--delayed-retry&viewMode=story&globals=theme:${theme}`,
      );
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      const first = page.getByRole("button", { name: "Launch Studio", exact: true });
      await expect(first).toBeVisible();
      await expect(first).toBeFocused();
      await expect(first).toBeInViewport({ ratio: 1 });
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("button", { name: "Partner Workspace", exact: true }),
      ).toBeFocused();
    });

    test(`background workspace recovery keeps draft focus at ${suffix}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `/iframe.html?id=scenes-workspace-root-states--recovery-while-editing&viewMode=story&globals=theme:${theme}`,
      );
      const input = page.getByRole("textbox", { name: "Workspace name", exact: true });
      await input.fill("Draft workspace");
      await expect(page.getByRole("button", { name: "Launch Studio", exact: true })).toBeVisible();
      await expect(input).toHaveValue("Draft workspace");
      await expect(input).toBeFocused();
    });
  }

  test(`signup uses available height before internal scrolling at 390x700 in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    const controls = () => [
      page.getByLabel("Name", { exact: true }),
      page.getByLabel("Password", { exact: true }),
      page.getByRole("button", { name: "Create account", exact: true }),
    ];
    await page.goto(
      `/iframe.html?id=scenes-account-authentication--sign-up&viewMode=story&globals=theme:${theme}`,
    );
    await expect(controls()[0]!).toBeVisible();
    const ready = await boxes(controls());
    await page.goto(
      `/iframe.html?id=scenes-account-authentication--sign-up-error&viewMode=story&globals=theme:${theme}`,
    );
    const heading = page.getByRole("heading", { name: "Create your account", exact: true });
    await expect(heading).toBeVisible();
    const card = await heading.evaluate((element) => {
      const card = element.closest('[data-slot="card"]')!;
      return { height: card.clientHeight, content: card.scrollHeight, scrollTop: card.scrollTop };
    });
    expect(card.content, "The complete form fits the available card height").toBeLessThanOrEqual(
      card.height + 1,
    );
    expect(card.scrollTop).toBe(0);
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole("alert")).toBeInViewport({ ratio: 1 });
    expectStable(await boxes(controls()), ready);
  });
}
