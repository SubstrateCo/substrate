import { api, parallel, type Account } from "./client";
import { DISCUSSION_MESSAGES_PER_USER, FOLLOW_UPS_PER_USER, seedRequest } from "./fixture";

/** Follow-up API retains source links and enforces the task audience consent. */
export async function context(members: Account[], conversationId: string) {
  await parallel(members, async (member) => {
    const customer = member.crm;
    if (!customer || !conversationId)
      throw new Error(`Missing workspace context for ${member.email}`);
    const organizationId = member.organizationId;
    const projectEntityId = customer.projectEntityId;
    for (let index = 0; index < FOLLOW_UPS_PER_USER; index++) {
      await api(member.client, "/api/v1/crm/mutations", {
        organizationId,
        action: "createFollowUp",
        entityId: customer.dealEntityId,
        projectEntityId,
        requestId: seedRequest(`${member.email}:follow-up:${index}`),
        title: `Customer rollout step ${index + 1}`,
        description: "Confirm requirements and procurement milestones with the customer.",
        consentToTaskAudience: true,
        status: ["in_progress", "completed", "in_review", "not_started"][index]!,
        priority: index === 0 ? "high" : "medium",
        dueDate: `2026-10-${String(index + 12).padStart(2, "0")}`,
      });
    }
    const project = await api<{ tasks: { entityId: string; title: string }[] }>(
      member.client,
      `/api/v1/tasks/project?organizationId=${organizationId}&projectEntityId=${projectEntityId}`,
    );
    const taskEntityId = project.tasks.find(
      (row) => row.title === "Customer rollout step 1",
    )?.entityId;
    if (!taskEntityId) throw new Error(`Missing follow-up task for ${member.email}`);
    const discussion = await api<{ conversationId: string }>(
      member.client,
      "/api/v1/tasks/discussion",
      {
        organizationId,
        projectEntityId,
        taskEntityId,
      },
    );
    for (let index = 0; index < DISCUSSION_MESSAGES_PER_USER; index++) {
      await api(member.client, "/api/v1/messaging/messages", {
        organizationId,
        conversationId: discussion.conversationId,
        requestId: seedRequest(`${member.email}:discussion:${index}`),
        body: `Customer review ${index + 1}: coordinate @[task:${taskEntityId}] and confirm the next milestone.`,
      });
    }
    member.workspace = {
      conversationId,
      projectEntityId,
      taskEntityId,
      discussionId: discussion.conversationId,
    };
  });
}
