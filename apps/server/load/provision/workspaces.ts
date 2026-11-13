import { api, parallel, type Account } from "./client";
import {
  channelCount,
  channelMessages,
  DM_MESSAGES,
  GROUP_MESSAGES,
  projectCount,
  projectTasks,
  seedRequest,
} from "./fixture";

const channels = [
  "general",
  "product",
  "engineering",
  "customer-success",
  "operations",
  "design",
  "sales",
  "research",
  "platform",
  "launch",
  "leadership",
  "watercooler",
];
const projects = [
  "Customer Onboarding",
  "Platform Reliability",
  "Website Refresh",
  "Quarterly Planning",
  "Mobile Experience",
  "Partner Integrations",
  "Analytics Rollout",
  "Security Review",
];

// A fixed seed keeps membership subsets and creators stable when a run resumes.
function shuffle<T>(items: readonly T[], seed: number) {
  const result = [...items];
  let state = seed + 1;
  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export async function workspace(members: Account[], orgIndex: number) {
  const organizationId = members[0]!.organizationId;
  const query = `?organizationId=${organizationId}`;
  let generalId = "";
  for (let index = 0; index < channelCount(members.length); index++) {
    const creator = members[index % members.length]!;
    const name = channels[index] ?? `team-${index + 1}`;
    const existing = await api<{ id: string; name: string; kind: string }[]>(
      creator.client,
      `/api/v1/messaging/conversations${query}`,
    );
    const selected =
      index === 0
        ? members
        : shuffle(
            members.filter((member) => member !== creator),
            orgIndex * 100 + index,
          ).slice(0, Math.min(20, Math.max(2, Math.ceil(members.length / 3))));
    const conversation =
      existing.find((item) => item.kind === "channel" && item.name === name) ??
      (await api<{ id: string }>(creator.client, "/api/v1/messaging/conversations", {
        organizationId,
        kind: "channel",
        name,
        private: index > 0 && index % 2 === 0,
      }));
    const invitees = selected.filter((member) => member !== creator);
    for (let offset = 0; offset < invitees.length; offset += 30)
      await api(creator.client, "/api/v1/messaging/members", {
        organizationId,
        conversationId: conversation.id,
        emails: invitees.slice(offset, offset + 30).map((member) => member.email),
        shareHistory: true,
      });
    if (index === 0) generalId = conversation.id;
    for (let message = 0; message < channelMessages(members.length, index); message++) {
      const author = [creator, ...invitees][message % (invitees.length + 1)]!;
      await api(author.client, "/api/v1/messaging/messages", {
        organizationId,
        conversationId: conversation.id,
        requestId: seedRequest(`org:${orgIndex}:channel:${index}:message:${message}`),
        body: `${name} update ${message + 1}: ${["Reviewed delivery progress and next steps.", "Customer feedback is ready for review.", "The implementation is ready for validation.", "Confirmed the plan with the delivery team."][message % 4]}`,
      });
    }
  }

  if (members.length > 1) {
    const pairs = shuffle(members, orgIndex + 901);
    for (
      let index = 0;
      index < (members.length === 2 ? 1 : Math.min(members.length, 16));
      index++
    ) {
      const creator = pairs[index]!;
      const recipient = pairs[(index + 1) % pairs.length]!;
      const conversation = await api<{ id: string }>(
        creator.client,
        "/api/v1/messaging/conversations",
        {
          organizationId,
          kind: "dm",
          emails: [recipient.email],
        },
      );
      for (let message = 0; message < DM_MESSAGES; message++) {
        const author = message % 2 === 0 ? creator : recipient;
        await api(author.client, "/api/v1/messaging/messages", {
          organizationId,
          conversationId: conversation.id,
          requestId: seedRequest(`org:${orgIndex}:dm:${index}:message:${message}`),
          body: `Delivery check-in ${message + 1}: reviewed the plan and confirmed next steps.`,
        });
      }
    }
  }
  if (members.length > 2) {
    for (let index = 0; index < 3; index++) {
      const selected = shuffle(members, orgIndex * 100 + index + 400);
      const creator = selected[0]!;
      const name = ["Launch coordination", "Customer feedback", "Planning circle"][index]!;
      const existing = await api<{ id: string; name: string; kind: string }[]>(
        creator.client,
        `/api/v1/messaging/conversations${query}`,
      );
      const conversation =
        existing.find((item) => item.kind === "group" && item.name === name) ??
        (await api<{ id: string }>(creator.client, "/api/v1/messaging/conversations", {
          organizationId,
          kind: "group",
          name,
          emails: selected.slice(1, 4).map((member) => member.email),
        }));
      for (let message = 0; message < GROUP_MESSAGES; message++) {
        const author = selected[message % Math.min(4, selected.length)]!;
        await api(author.client, "/api/v1/messaging/messages", {
          organizationId,
          conversationId: conversation.id,
          requestId: seedRequest(`org:${orgIndex}:group:${index}:message:${message}`),
          body: `${name} review ${message + 1}: confirm owners, milestones, and customer feedback.`,
        });
      }
    }
  }

  const count = projectCount(members.length);
  await parallel(projects.slice(0, count), async (name, index) => {
    const creator = members[(index + 1) % members.length]!;
    const existing = await api<{ entityId: string; name: string }[]>(
      creator.client,
      `/api/v1/tasks/projects${query}`,
    );
    const projectEntityId =
      existing.find((item) => item.name === name)?.entityId ??
      (
        await api<{ id: string }>(creator.client, "/api/v1/tasks/mutations", {
          organizationId,
          action: "createProject",
          name,
          description: `Shared planning and delivery for ${name.toLowerCase()}.`,
        })
      ).id;
    const detail = await api<{ tasks: { entityId: string; title: string }[] }>(
      creator.client,
      `/api/v1/tasks/project${query}&projectEntityId=${projectEntityId}`,
    );
    let taskEntityId = "";
    for (let task = 0; task < projectTasks(members.length, index); task++) {
      const title =
        task === 0 ? `${name} kickoff` : `${name} delivery ${String(task).padStart(3, "0")}`;
      const id =
        detail.tasks.find((row) => row.title === title)?.entityId ??
        (
          await api<{ id: string }>(creator.client, "/api/v1/tasks/mutations", {
            organizationId,
            action: "createTask",
            projectEntityId,
            title,
            description:
              "Review requirements, implement the agreed scope, and validate with the team.",
            status: ["completed", "completed", "in_progress", "in_review", "not_started"][
              task % 5
            ]!,
            priority: ["medium", "high", "low", "none"][task % 4]!,
            dueDate: `2026-10-${String(1 + (task % 28)).padStart(2, "0")}`,
          })
        ).id;
      if (task === 0) taskEntityId = id;
    }
    const { conversationId } = await api<{ conversationId: string }>(
      creator.client,
      "/api/v1/tasks/discussion",
      { organizationId, projectEntityId, taskEntityId },
    );
    await api(creator.client, "/api/v1/messaging/messages", {
      organizationId,
      conversationId,
      requestId: seedRequest(`org:${orgIndex}:project:${index}:kickoff`),
      body: `Coordinate delivery of @[task:${taskEntityId}] here.`,
    });
  });
  return generalId;
}
