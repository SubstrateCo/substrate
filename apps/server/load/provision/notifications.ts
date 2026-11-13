import { api, type Account } from "./client";
import { requireNotificationMembers, seedRequest } from "./fixture";

/** Real person mentions produce authorized notifications through the normal message API. */
export async function notifications(members: Account[], conversationId: string) {
  requireNotificationMembers([members.length]);
  const organizationId = members[0]!.organizationId;
  const conversations = await api<
    {
      id: string;
      members: { actorId: string; userId: string | null; organizationId: string; type: string }[];
    }[]
  >(
    members[0]!.client,
    `/api/v1/messaging/conversations?organizationId=${organizationId}&conversationId=${conversationId}`,
  );
  const conversation = conversations.find((row) => row.id === conversationId);
  if (!conversation) throw new Error("Missing joined general channel for notification fixtures");
  for (const member of members) {
    const actor = conversation.members.find(
      (row) =>
        row.userId === member.userId &&
        row.organizationId === organizationId &&
        row.type === "human",
    );
    if (!actor) throw new Error(`Missing channel actor for ${member.email}`);
    member.actorEntityId = actor.actorId;
  }
  for (const [index, recipient] of members.entries()) {
    const sender = members[(index + 1) % members.length]!;
    const message = await api<{ id: string }>(sender.client, "/api/v1/messaging/messages", {
      organizationId,
      conversationId,
      requestId: seedRequest(`${recipient.email}:notification:general`),
      body: `@[person:${recipient.actorEntityId!}] Please review the delivery plan and confirm the next milestone.`,
    });
    recipient.notification = {
      messageId: message.id,
      conversationId,
      senderUserId: sender.userId,
      senderActorEntityId: sender.actorEntityId!,
    };
  }
}
