import { DesktopSessionAuthority } from "../session/desktop-session-authority.ts";
import { createMailSession } from "./session.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const owner = { userId: "user", organizationId: "first" };
type FixtureBackend = {
  scope: typeof owner;
  inbox: boolean;
  beforeNextCheck?: () => Promise<void>;
};
export async function mailFixture(scope = owner) {
  const dir = await mkdtemp(join(tmpdir(), "mail-session-"));
  const backend: FixtureBackend = { scope, inbox: true };
  const authority = new DesktopSessionAuthority({
    backend: "https://api.example.test",
    fetchAPI: async (url) => {
      if (new URL(url).pathname === "/api/auth/get-session") {
        const pause = backend.beforeNextCheck,
          active = backend.scope;
        backend.beforeNextCheck = undefined;
        await pause?.();
        return Response.json({
          user: { id: active.userId, emailVerified: true },
          session: { activeOrganizationId: active.organizationId },
        });
      }
      if (new URL(url).pathname === "/api/v1/organizations/apps")
        return Response.json({
          success: true,
          data: {
            organizationId: backend.scope.organizationId,
            enabledApps: backend.inbox ? ["messages", "agents", "inbox"] : ["messages", "agents"],
          },
        });
      return Response.json({ role: "member" });
    },
  });
  const session = createMailSession({ authority, accountsDirectory: dir }, () => {});
  const connect = (id: string) =>
    session.use(scope, (l) =>
      l.db.connect({
        provider: "gmail",
        providerAccountId: id,
        address: `${id}@example.test`,
        protectedGrant: "local-fixture",
        nickname: null,
      }),
    );
  return {
    session,
    authority,
    backend,
    connect,
    close: async () => {
      await session.stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
