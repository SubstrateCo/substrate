import { encodeMotion, type MotionFrame } from "../../scripts/encode-motion";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";

function artifactsDirectory(info: TestInfo) {
  if (!info.config.configFile) throw new Error("Mobile review requires its Playwright config.");
  return resolve(dirname(info.config.configFile), "test-results/mobile-review");
}

function artifactName(info: TestInfo, name: string) {
  return `${info.project.name}-${name}`;
}

export async function captureScreenshot(page: Page, info: TestInfo, name: string) {
  const file = `${artifactName(info, name)}.png`;
  const directory = resolve(artifactsDirectory(info), "screenshots");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, file);
  for (const id of ["conversation-drawer", "record-panel"]) {
    for (const panel of await page.getByTestId(id).all()) {
      if (!(await panel.isVisible())) continue;
      const covered = await panel.evaluate((element) =>
        Boolean(element.closest('[aria-hidden="true"]')),
      );
      if (covered) continue;
      try {
        await expect
          .poll(async () =>
            panel.evaluateAll((elements, side) => {
              if (elements.length === 0) return 0;
              const element = elements[0];
              const bounds = element.getBoundingClientRect();
              return Math.round(
                side === "conversation-drawer" ? bounds.left : bounds.right - innerWidth,
              );
            }, id),
          )
          .toBe(0);
      } catch (error) {
        const geometry = await panel.evaluateAll((elements) => {
          if (elements.length === 0) return { detached: true };
          const element = elements[0];
          const ancestors = [];
          for (
            let node: Element | null = element;
            node && ancestors.length < 6;
            node = node.parentElement
          ) {
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            ancestors.push({
              tag: node.tagName,
              role: node.getAttribute("role"),
              x: rect.x,
              width: rect.width,
              right: rect.right,
              position: style.position,
              left: style.left,
              insetRight: style.right,
              transform: style.transform,
              margin: style.margin,
            });
          }
          return { innerWidth, clientWidth: document.documentElement.clientWidth, ancestors };
        });
        const geometryPath = info.outputPath("panel-geometry.json");
        await writeFile(geometryPath, JSON.stringify(geometry, null, 2));
        await info.attach("Panel geometry", {
          path: geometryPath,
          contentType: "application/json",
        });
        throw error;
      }
    }
  }
  // Real fonts and rendered content, with only decorative animation settled for still review.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, fullPage: false, animations: "disabled" });
  await info.attach(`Expo web preview · ${name}`, { path, contentType: "image/png" });
}

/**
 * Record real page frames around an action. Native iOS motion is explicitly out of scope.
 * A Chromium screencast starts after auth, so credentials and verification links are not recorded.
 */
export async function captureMotion(
  page: Page,
  info: TestInfo,
  name: string,
  action: () => Promise<void>,
) {
  const nameWithTheme = artifactName(info, name);
  const directory = info.outputPath(`frames-${name}`);
  const clips = resolve(artifactsDirectory(info), "clips");
  await Promise.all([mkdir(directory, { recursive: true }), mkdir(clips, { recursive: true })]);
  const session = await page.context().newCDPSession(page);
  const frames: MotionFrame[] = [];
  const writes: Promise<void>[] = [];
  let firstFrameAt = 0;
  let duration = 3;
  let resolveFirstFrame: (() => void) | undefined;
  const firstFrame = new Promise<void>((resolve) => {
    resolveFirstFrame = resolve;
  });
  session.on("Page.screencastFrame", (event) => {
    const now = performance.now();
    if (!firstFrameAt) firstFrameAt = now;
    const path = resolve(directory, `${String(frames.length).padStart(5, "0")}.jpg`);
    frames.push({ path, elapsed: (now - firstFrameAt) / 1000 });
    writes.push(writeFile(path, Buffer.from(event.data, "base64")));
    void session.send("Page.screencastFrameAck", { sessionId: event.sessionId });
    resolveFirstFrame?.();
  });
  try {
    await session.send("Page.startScreencast", {
      format: "jpeg",
      quality: 90,
      maxWidth: 390,
      maxHeight: 844,
      everyNthFrame: 1,
    });
    await Promise.race([
      firstFrame,
      setTimeout(10_000).then(() => {
        throw new Error("Chromium did not provide any real screencast footage.");
      }),
    ]);
    await Promise.all([action(), setTimeout(3000)]);
    const elapsed = (performance.now() - firstFrameAt) / 1000;
    expect(elapsed, `${name} finishes within the five-second review clip`).toBeLessThanOrEqual(5);
    duration = Math.max(3, elapsed);
    await session.send("Page.stopScreencast");
  } finally {
    await session.detach();
    await Promise.all(writes);
  }
  expect(frames.length, `${name} contains changing real browser frames`).toBeGreaterThan(1);
  const result = await encodeMotion(
    frames.filter((frame) => frame.elapsed <= duration),
    directory,
    resolve(clips, nameWithTheme),
    duration,
  );
  await info.attach(`Expo web preview · ${name} · MP4`, {
    path: result.mp4,
    contentType: "video/mp4",
  });
  await info.attach(`Expo web preview · ${name} · GIF`, {
    path: result.gif,
    contentType: "image/gif",
  });
}
