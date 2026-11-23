import { test } from "./fixtures";
import { expect } from "@playwright/test";

test("pooled windows preserve each test's viewport and reuse matching contexts", async ({
  contextPool,
}) => {
  const wide = { width: 1440, height: 900 };
  const narrow = { width: 1100, height: 700 };
  const first = await contextPool.take(wide);
  contextPool.release([first]);

  const second = await contextPool.take(narrow);
  try {
    const page = await second.newPage();
    expect(page.viewportSize()).toEqual(narrow);
    await page.close();
  } finally {
    contextPool.release([second]);
  }

  const reused = await contextPool.take(wide);
  try {
    expect(reused).toBe(first);
  } finally {
    contextPool.release([reused]);
  }
});
