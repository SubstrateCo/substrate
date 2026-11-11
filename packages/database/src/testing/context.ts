import { user } from "../schema";
import type { setupDatabase } from "./database";
import { createAcceptedMessagingService } from "./messaging";

type Fixture = ReturnType<typeof setupDatabase>;

/** Verified users, Alice's project, and her private channel with a root message and one reply. */
export async function contextConversation(f: Fixture) {
  await f.db.update(user).set({ emailVerified: true });
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Launch" });
  const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const conversation = await chat.createConversation({
    kind: "channel",
    name: "Private discussion",
    private: true,
  });
  const root = await chat.sendMessage(conversation.id, "Customer request");
  const reply = await chat.sendMessage(conversation.id, "Specific detail", root.id);
  return { repos, project, chat, conversation, root, reply };
}
