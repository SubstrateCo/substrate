import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

const variants = ["default", "secondary", "ghost", "outline", "destructive", "link"] as const;

// This supplements native workflow coverage with combinations not yet used by a screen.
// The probe needs Vite source modules; packaged workflows remain in the other specs.
test.skip(
  Boolean(process.env.DESKTOP_EXECUTABLE_PATH || process.env.DESKTOP_BUNDLED_RENDERER),
  "The style matrix requires the Vite-served primitive modules",
);

for (const size of [
  { width: 320, height: 568 },
  { width: 1024, height: 768 },
]) {
  for (const orientation of ["horizontal", "vertical"] as const) {
    test(`Electron ${orientation} button groups preserve all variants at ${size.width}x${size.height}`, async ({
      desktop,
    }) => {
      const page = desktop.page;
      await expect(page.getByRole("button", { name: "Sign in with browser" })).toBeVisible();
      await desktop.app.evaluate(({ BrowserWindow }, dimensions) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        window.setMinimumSize(0, 0);
        window.setContentSize(dimensions.width, dimensions.height);
      }, size);
      await expect
        .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
        .toEqual(size);

      await page.evaluate(
        async ({ variants, orientation }) => {
          // Variable URLs are resolved by Vite inside the native renderer, not by the test runner.
          const buttonURL = "/src/components/ui/button.tsx";
          const groupURL = "/src/components/ui/button-group.tsx";
          const cnURL = "/node_modules/.vite/deps/cn.js";
          const { buttonVariants } = await import(buttonURL);
          const { buttonGroupVariants } = await import(groupURL);
          const { cn } = await import(cnURL);
          const probe = document.createElement("section");
          probe.id = "button-group-probe";
          probe.setAttribute("aria-label", `${orientation} button variant matrix`);
          Object.assign(probe.style, {
            position: "fixed",
            inset: "0",
            zIndex: "9999",
            overflow: "auto",
            padding: "16px",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            alignContent: "start",
            gap: "16px",
            background: "var(--background)",
            color: "var(--foreground)",
          });
          for (const variant of variants) {
            const cell = document.createElement("div");
            const label = document.createElement("h2");
            label.textContent = variant;
            const baseline = document.createElement("button");
            baseline.className = cn(buttonVariants({ variant }));
            baseline.dataset.baseline = variant;
            baseline.hidden = true;
            const group = document.createElement("div");
            group.setAttribute("role", "group");
            group.setAttribute("aria-label", variant);
            group.dataset.slot = "button-group";
            group.className = cn(buttonGroupVariants({ orientation }));
            for (let index = 0; index < 3; index++) {
              const control = document.createElement(index === 1 ? "a" : "button");
              if (control instanceof HTMLAnchorElement) control.href = "#button-group-probe";
              control.className = cn(buttonVariants({ variant }));
              control.textContent = String(index + 1);
              // Button asChild keeps data-variant on anchors. TooltipTrigger can replace data-slot.
              control.dataset.slot = index === 1 ? "button" : "tooltip-trigger";
              if (index !== 0) control.dataset.variant = variant;
              group.append(control);
            }
            cell.append(label, group, baseline);
            probe.append(cell);
          }
          document.body.append(probe);
        },
        { variants, orientation },
      );

      const probe = page.locator("#button-group-probe");
      const reference = await probe.locator('[data-baseline="outline"]').evaluate((element) => {
        const style = getComputedStyle(element);
        return { border: style.borderTopColor, height: parseFloat(style.height) };
      });
      expect(reference.border).not.toBe("rgba(0, 0, 0, 0)");
      for (const variant of variants) {
        const group = probe.getByRole("group", { name: variant, exact: true });
        const appearance = await group.evaluate((element) => {
          const baseline = getComputedStyle(
            element.parentElement!.querySelector("[data-baseline]")!,
          );
          return {
            baseline: { color: baseline.color, background: baseline.backgroundColor },
            controls: Array.from(element.children, (child) => {
              const style = getComputedStyle(child);
              const rect = child.getBoundingClientRect();
              return {
                color: style.color,
                background: style.backgroundColor,
                borders: [
                  style.borderTopColor,
                  style.borderRightColor,
                  style.borderBottomColor,
                  style.borderLeftColor,
                ],
                widths: [
                  style.borderTopWidth,
                  style.borderRightWidth,
                  style.borderBottomWidth,
                  style.borderLeftWidth,
                ],
                corners: [
                  style.borderTopLeftRadius,
                  style.borderTopRightRadius,
                  style.borderBottomRightRadius,
                  style.borderBottomLeftRadius,
                ],
                x: rect.x,
                y: rect.y,
                right: rect.right,
                bottom: rect.bottom,
                height: rect.height,
                width: rect.width,
              };
            }),
          };
        });
        const controls = appearance.controls;
        const radius =
          orientation === "horizontal" ? controls[2]!.corners[1] : controls[2]!.corners[2];
        expect(parseFloat(radius!)).toBeGreaterThan(0);
        for (const [index, control] of controls.entries()) {
          const context = `${variant} ${orientation} control ${index + 1}`;
          expect({ color: control.color, background: control.background }, context).toEqual(
            appearance.baseline,
          );
          expect(control.borders, `${context}: uniform visible border`).toEqual(
            Array(4).fill(reference.border),
          );
          expect(control.widths, `${context}: one shared seam`).toEqual(
            orientation === "horizontal"
              ? ["1px", "1px", "1px", index === 0 ? "1px" : "0px"]
              : [index === 0 ? "1px" : "0px", "1px", "1px", "1px"],
          );
          expect(control.corners, `${context}: symmetric outer corners, square seams`).toEqual(
            orientation === "horizontal"
              ? [
                  index === 0 ? radius : "0px",
                  index === 2 ? radius : "0px",
                  index === 2 ? radius : "0px",
                  index === 0 ? radius : "0px",
                ]
              : [
                  index === 0 ? radius : "0px",
                  index === 0 ? radius : "0px",
                  index === 2 ? radius : "0px",
                  index === 2 ? radius : "0px",
                ],
          );
          expect(control.height, `${context}: retained button height`).toBe(reference.height);
          expect(control.x).toBeGreaterThanOrEqual(0);
          expect(control.right).toBeLessThanOrEqual(size.width);
          expect(control.bottom).toBeLessThanOrEqual(size.height);
          if (index > 0) {
            const previous = controls[index - 1]!;
            expect(
              orientation === "horizontal" ? control.x : control.y,
              `${context}: no gap or overlap`,
            ).toBe(orientation === "horizontal" ? previous.right : previous.bottom);
            expect(orientation === "horizontal" ? control.height : control.width).toBe(
              orientation === "horizontal" ? previous.height : previous.width,
            );
          }
        }

        await group.locator("button").first().focus();
        await page.keyboard.press("Tab");
        const anchor = group.getByRole("link");
        await expect(anchor).toBeFocused();
        const focus = await anchor.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            visible: element.matches(":focus-visible"),
            shadow: style.boxShadow,
            zIndex: style.zIndex,
          };
        });
        expect(focus.visible, `${variant}: keyboard focus remains visible`).toBe(true);
        expect(focus.shadow).not.toBe("none");
        expect(focus.shadow).toMatch(/2px/);
        expect(focus.zIndex).toBe("10");
        await anchor.evaluate((element) => {
          if (element instanceof HTMLAnchorElement) element.blur();
        });
      }
    });
  }
}
