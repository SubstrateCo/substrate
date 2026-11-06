import { expect, test } from "@playwright/test";
import { openStory, selectStory } from "./stories";

const shards = 6;

for (let shard = 0; shard < shards; shard++) {
  test(`every story renders without app services or runtime errors (shard ${shard + 1}/${shards})`, async ({
    page,
    request,
  }) => {
    const response = await request.get("/index.json");
    const index: { entries: Record<string, { id: string; type: string }> } = await response.json();
    const stories = Object.values(index.entries)
      .filter((entry) => entry.type === "story")
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((_, index) => index % shards === shard);
    const errors: string[] = [];
    const serviceRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.pathname.startsWith("/api/") ||
        request.method() === "POST" ||
        url.origin !== "http://127.0.0.1:6007"
      )
        serviceRequests.push(request.url());
    });
    expect(stories.length).toBeGreaterThan(0);
    for (const [index, story] of stories.entries()) {
      await test.step(
        story.id,
        async () => {
          if (index === 0) await openStory(page, story.id);
          else await selectStory(page, story.id);
          await expect(page.locator("#storybook-root > div")).toBeVisible();
          await expect(page.locator(".sb-errordisplay")).not.toBeVisible();
          expect(errors, story.id).toEqual([]);
        },
        { timeout: 15000 },
      );
    }
    expect(serviceRequests).toEqual([]);
  });
}
