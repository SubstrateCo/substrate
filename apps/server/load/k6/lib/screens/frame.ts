import { cached, mount } from "../client-cache.ts";
import { call } from "../http.ts";
import { keys } from "../keys.ts";
import type { Person, World } from "../world.ts";
import { applyUnread } from "../world.ts";
import { showPictures } from "./pictures.ts";

/** GET /organizations/current: what the frame shows and the viewer's role. */
export interface OrganizationSummary {
  id: string;
  name: string;
  logo: string | null;
  role: string;
}

/** Better Auth's full organization, which only the organization settings pages read. */
export interface FullOrganization {
  logo?: string | null;
  members: {
    id: string;
    userId: string;
    role: string;
    user: { name: string; email: string; image?: string | null };
  }[];
}

/** The organization summary (queries/organizations/options.ts currentOrganizationQueryOptions). */
export function mountOrganizationSummary(world: World, frame?: true) {
  const org = world.organizationId;
  return mount(
    keys.organizationSummary(org),
    () => call<OrganizationSummary>("organizations.current"),
    { frame },
  );
}

/** Workspace people for pickers (queries/organizations/people.ts), fresh for 30 s. */
export function mountPeople(world: World) {
  return mount(keys.organizationPeople(world.organizationId), async () => {
    const rows =
      await call<{ userId: string; name: string; email: string; image: string | null }[]>(
        "organizations.people",
      );
    if (rows)
      world.people = rows.map((row): Person => ({
        userId: row.userId,
        name: row.name,
        email: row.email,
        image: row.image ?? null,
      }));
    return rows;
  });
}

/** The full organization on the organization settings pages (general, picture, members). */
export function mountFullOrganization(world: World) {
  const org = world.organizationId;
  return mount(keys.organizationDetail(org), () =>
    call<FullOrganization>("auth.fullOrganization", { organizationId: org }),
  );
}

/** The workspace's message unread counts; the frame and the conversation list share it. */
export function mountMessageUnread(world: World, frame?: true) {
  return mount(
    keys.messageUnread(world.organizationId),
    async () => {
      const rows =
        await call<{ conversationId: string; unreadCount: number }[]>("messaging.unread");
      if (rows) applyUnread(world, rows);
      return rows;
    },
    { frame },
  );
}

/**
 * The always-mounted workspace frame (components/workspace/workspace-frame.tsx): session,
 * organization summary with the viewer's role, notification dot, message unread dot and agent
 * needs-you dot.
 */
export async function mountFrame(world: World) {
  const org = world.organizationId;
  const frame = true;
  const [, summary] = await Promise.all([
    mount(keys.session, () => call("session"), { staleTime: Infinity, frame }),
    mountOrganizationSummary(world, frame),
    mount(
      keys.notificationUnread(org),
      async () => {
        const status = await call<{ unread: boolean }>("context.notifications.unread");
        if (status) world.hasUnreadNotifications = status.unread;
        return status;
      },
      { frame },
    ),
    mountMessageUnread(world, frame),
    mount(keys.agentWorkNeedsYou(world.userId, org), () => call("agentWork.needsYou"), { frame }),
  ]);
  // The frame shows the organization logo and the user's own avatar.
  const session = cached<{ user?: { image?: string | null } }>(keys.session);
  await showPictures("frame", world.userId, [summary?.logo, session?.user?.image]);
}
