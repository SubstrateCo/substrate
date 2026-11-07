import { expect, type Page } from "@playwright/test";

// Hold a completed native request, not the request itself. A cancellation must
// still prevent this pre-revocation success from entering the query cache.
export async function holdAccessResponse(page: Page, pathname: string, projectEntityId: string) {
  const gate = await page.evaluateHandle(
    ({ pathname, projectEntityId }) => {
      const original = window.fetch;
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => (release = resolve));
      const state = { captured: false, returned: false, status: 0, body: "" };
      let selected = false;
      const wrapped = new Proxy(original, {
        async apply(target, _thisArg, [input, init]: Parameters<typeof fetch>) {
          const url = new URL(input instanceof Request ? input.url : String(input), location.href);
          const hold =
            !selected &&
            url.pathname === pathname &&
            url.searchParams.get("projectEntityId") === projectEntityId;
          if (hold) selected = true;
          const response = await target(input, init);
          if (hold) {
            state.status = response.status;
            state.body = await response.clone().text();
            state.captured = true;
            await blocked;
            state.returned = true;
          }
          return response;
        },
      });
      window.fetch = wrapped;
      return {
        state,
        release,
        restore: () => {
          release();
          if (window.fetch === wrapped) window.fetch = original;
        },
      };
    },
    { pathname, projectEntityId },
  );
  return {
    async captured(privateText: string) {
      await expect.poll(() => gate.evaluate(({ state }) => state.captured)).toBe(true);
      const response = await gate.evaluate(({ state }) => state);
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
      expect(response.body).toContain(privateText);
    },
    async release() {
      await gate.evaluate(({ release }) => release());
      await expect.poll(() => gate.evaluate(({ state }) => state.returned)).toBe(true);
      // Let the resolved fetch and the next React paint run before checking UI.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    },
    async restore() {
      await gate.evaluate(({ restore }) => restore());
      await gate.dispose();
    },
  };
}
