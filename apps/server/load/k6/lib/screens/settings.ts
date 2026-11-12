import { mount, navigate } from "../client-cache.ts";
import { call } from "../http.ts";
import { keys } from "../keys.ts";
import type { World } from "../world.ts";
import { mountFullOrganization, mountOrganizationSummary } from "./frame.ts";
import { showPictures } from "./pictures.ts";
import { showSharingSettings } from "./sharing.ts";

/**
 * Settings (components/settings/settings-shell.tsx and the organization sections). The shell
 * reads the session and the organization summary with the role, which the frame already holds.
 * Only the organization general, picture and members pages read the full organization.
 * Organization sections are shown to owners and admins only.
 */

export type SettingsPage =
  | "profile"
  | "your-invitations"
  | "members"
  | "invitations"
  | "conversations"
  | "sharing"
  | "organization";

export async function showSettings(world: World, page: SettingsPage) {
  navigate("settings");
  const org = world.organizationId;
  await mountOrganizationSummary(world);
  switch (page) {
    case "your-invitations":
      return (
        (await mount(keys.userInvitations, () => call<unknown[]>("auth.userInvitations")))
          ?.length ?? 0
      );
    case "invitations":
      return (
        (
          await mount(keys.organizationInvitations(org), () =>
            call<unknown[]>("auth.listInvitations", { organizationId: org }),
          )
        )?.length ?? 0
      );
    case "conversations":
      return (
        (
          await mount(keys.managedConversations(org), () =>
            call<unknown[]>("messaging.conversations.managed"),
          )
        )?.length ?? 0
      );
    case "sharing": {
      const { conversations, inbox } = await showSharingSettings(world);
      return conversations.length + inbox.length;
    }
    case "members": {
      // organization-members.tsx: the full organization for the list and roles.
      const members = (await mountFullOrganization(world))?.members ?? [];
      // Each page visit mounts the list again; about 20 rows fit the window.
      await showPictures(
        "members",
        crypto.randomUUID(),
        members.slice(0, 20).map((member) => member.user.image),
      );
      return members.length;
    }
    case "organization":
      // organization-general.tsx and organization-picture.tsx read the full organization.
      await mountFullOrganization(world);
      return 1;
    case "profile":
      // The name and picture fields read the session the shell holds.
      return 1;
  }
}
