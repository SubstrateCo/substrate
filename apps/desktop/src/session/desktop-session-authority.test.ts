import { DesktopSessionAuthority } from "./desktop-session-authority.ts";
import { expect, test } from "bun:test";

test("invalidation rejects an old verification and drops the catalog cache", async () => {
  const gate = Promise.withResolvers<void>();
  let delayed = true;
  let catalogCalls = 0;
  const authority = new DesktopSessionAuthority({
    backend: "https://api.example.com",
    fetchAPI: async (url) => {
      if (url.endsWith("/session")) {
        if (delayed) await gate.promise;
        return Response.json({
          success: true,
          data: {
            user: { id: "user", emailVerified: true },
            session: { activeOrganizationId: "org" },
          },
        });
      }
      if (url.includes("get-active-member-role")) return Response.json({ role: "owner" });
      catalogCalls++;
      return Response.json({ success: true, data: { agents: [], runSettings: [] } });
    },
  });
  let changes = 0;
  authority.onChange(() => {
    changes++;
  });
  const old = authority.verify();
  authority.invalidate();
  delayed = false;
  gate.resolve();
  // oxlint-disable-next-line typescript/await-thenable -- Bun's rejection assertion is asynchronous at runtime.
  await expect(old).rejects.toThrow("Session changed.");
  expect((await authority.verify()).organizationId).toBe("org");
  await authority.catalog();
  await authority.catalog();
  expect(catalogCalls).toBe(1);
  authority.invalidate();
  await authority.catalog();
  expect(catalogCalls).toBe(2);
  expect(changes).toBe(2);
});
