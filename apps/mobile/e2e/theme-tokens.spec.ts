import { themes } from "@substrate/design-tokens";
import { mobileTheme } from "@substrate/design-tokens/mobile";

import { test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const canonicalStylesheet = resolve(__dirname, "../../web/src/components/styles.css");
type SemanticPalette = Record<string, string>;

test("every semantic color matches browser-resolved web CSS, including aliases and alpha", async ({
  page,
  workspace,
}, info) => {
  const scheme = info.project.use.colorScheme === "dark" ? "dark" : "light";
  const source = await readFile(canonicalStylesheet, "utf8");
  await signIn(page, info, workspace);
  const exported: SemanticPalette = themes[scheme];
  const mobile: SemanticPalette = mobileTheme[scheme];

  const reference = await page.evaluate(
    ({ source, scheme, exported, mobile }) => {
      const frame = document.createElement("iframe");
      frame.hidden = true;
      document.body.append(frame);
      const doc = frame.contentDocument!;
      const view = frame.contentWindow!;
      const style = doc.createElement("style");
      style.textContent = source.replace(/^\s*@import[^\n]+;/gm, "");
      doc.head.append(style);
      doc.documentElement.classList.toggle("dark", scheme === "dark");
      const root = view.getComputedStyle(doc.documentElement);
      const names = new Set<string>();
      for (const rule of Array.from(style.sheet!.cssRules)) {
        if (rule.constructor.name !== "CSSStyleRule") continue;
        // SAFETY: CSSOM identifies this rule as a CSSStyleRule above, including across iframe realms.
        const declaration = rule as CSSStyleRule;
        if (![":root", ".dark"].includes(declaration.selectorText)) continue;
        for (const name of Array.from(declaration.style)) {
          if (name.startsWith("--") && CSS.supports("color", root.getPropertyValue(name))) {
            names.add(name.slice(2));
          }
        }
      }
      const canvas = doc.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { colorSpace: "srgb" })!;
      function colorChannels(value: string, background?: string) {
        context.clearRect(0, 0, 1, 1);
        if (background) {
          context.fillStyle = background;
          context.fillRect(0, 0, 1, 1);
        }
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data);
      }
      const colors = Array.from(names)
        .sort()
        .map((name) => {
          const canonical = root.getPropertyValue(`--${name}`).trim();
          const camel = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
          const native = exported[name];
          const bridge = mobile[camel];
          return {
            name,
            canonical,
            native,
            bridge,
            alpha: colorChannels(canonical)[3],
            nativeAlpha: native ? colorChannels(native)[3] : undefined,
            bridgeAlpha: bridge ? colorChannels(bridge)[3] : undefined,
            // Compare opaque composites to avoid unpremultiplication error on faint overlays.
            comparisons: ["black", "white"].map((background) => ({
              canonical: colorChannels(canonical, background),
              native: native ? colorChannels(native, background) : [],
              bridge: bridge ? colorChannels(bridge, background) : [],
            })),
          };
        });
      const utilities = ["background", "card", "popover", "foreground"].map((name) => {
        const probe = document.createElement("div");
        probe.className = name === "foreground" ? "text-foreground" : `bg-${name}`;
        document.body.append(probe);
        const computed = getComputedStyle(probe);
        const value = name === "foreground" ? computed.color : computed.backgroundColor;
        const actual = colorChannels(value);
        const expected = colorChannels(root.getPropertyValue(`--${name}`));
        probe.remove();
        return { name, actual, expected };
      });
      frame.remove();
      return { names: Array.from(names).sort(), colors, utilities };
    },
    {
      source,
      scheme,
      exported,
      mobile,
    },
  );
  expect(Object.keys(themes[scheme]).sort()).toEqual(reference.names);
  expect(Object.keys(mobileTheme[scheme]).sort()).toEqual(
    reference.names
      .map((name) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()))
      .sort(),
  );
  for (const color of reference.colors) {
    const label = `${scheme} ${color.name}: ${color.canonical}`;
    expect(color.native, label).toBeDefined();
    expect(color.bridge, label).toBeDefined();
    expect(color.nativeAlpha, label).toBe(color.alpha);
    expect(color.bridgeAlpha, label).toBe(color.alpha);
    for (const comparison of color.comparisons) {
      for (let channel = 0; channel < 3; channel++) {
        expect(
          Math.abs(comparison.native[channel]! - comparison.canonical[channel]!),
          label,
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(comparison.bridge[channel]! - comparison.canonical[channel]!),
          label,
        ).toBeLessThanOrEqual(1);
      }
    }
  }
  for (const utility of reference.utilities) {
    for (let channel = 0; channel < 4; channel++) {
      expect(
        Math.abs(utility.actual[channel]! - utility.expected[channel]!),
        `${scheme} rendered ${utility.name} utility`,
      ).toBeLessThanOrEqual(1);
    }
  }
});

test("messaging panes and a real dialog use the same web surface roles", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  const scheme = info.project.use.colorScheme === "dark" ? "dark" : "light";
  for (const id of ["app-shell", "messaging-screen"]) {
    await expect(page.getByTestId(id)).toHaveCSS(
      "background-color",
      themes[scheme].surface.replace("rgba(", "rgb(").replace(", 1)", ")"),
    );
  }
  await page.getByTestId("open-conversations").click();
  await page.getByTestId("new-message").click();
  await expect(page.getByRole("dialog", { name: "New message", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New channel", exact: true }).click();
  const sheet = page.getByTestId("dialog-content").filter({
    has: page.getByRole("heading", { name: "New channel", exact: true }),
  });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS(
    "background-color",
    themes[scheme].popover.replace("rgba(", "rgb(").replace(", 1)", ")"),
  );
});

test("project, task, CRM and interaction panes retain the web surface role and unclipped tabs", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  const scheme = info.project.use.colorScheme === "dark" ? "dark" : "light";
  const surface = themes[scheme].surface.replace("rgba(", "rgb(").replace(", 1)", ")");
  await page.getByTestId("nav-tasks").click();
  await expect(page.getByTestId("tasks-screen")).toHaveCSS("background-color", surface);
  await page.getByTestId(`project-${workspace.projectId}`).click();
  await expect(page.getByTestId("project-detail")).toHaveCSS("background-color", surface);
  await page
    .getByRole("button", { name: "Review the mobile launch checklist", exact: true })
    .click();
  await expect(page.getByTestId("task-detail")).toHaveCSS("background-color", surface);
  for (const [kind, id] of [
    ["account", workspace.accountId],
    ["deal", workspace.dealId],
    ["contact", workspace.contactId],
  ]) {
    await page.goto(
      `/?${new URLSearchParams({ tab: "crm", record: JSON.stringify({ kind, id }) })}`,
    );
    await expect(page.getByTestId("crm-screen")).toHaveCSS("background-color", surface);
    await expect(page.getByTestId(`${kind}-detail`)).toHaveCSS("background-color", surface);
  }
  await page.getByRole("button", { name: /Discussed launch scope and the next design/ }).click();
  await expect(page.getByTestId("interaction-detail")).toHaveCSS("background-color", surface);
  await page.goto("/?tab=crm&crmSection=reports");
  const tabs = page.getByRole("tablist", { name: "CRM section", exact: true });
  await expect(tabs.getByRole("tab", { name: "Reports", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const geometry = await tabs.evaluate((element) => ({
    bounds: element.getBoundingClientRect().toJSON(),
    children: Array.from(element.querySelectorAll('[role="tab"]'), (tab) =>
      tab.getBoundingClientRect().toJSON(),
    ),
  }));
  expect(geometry.children.length).toBeGreaterThan(0);
  for (const tab of geometry.children) {
    expect(tab.top).toBeGreaterThanOrEqual(geometry.bounds.top);
    expect(tab.bottom).toBeLessThanOrEqual(geometry.bounds.bottom);
  }
});
