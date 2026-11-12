import { api, parallel, type Account } from "./client";

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
  const channelCount = Math.max(4, Math.round(members.length / 5));
  for (let index = 0; index < channelCount; index++) {
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
  }

  if (members.length > 1) {
    const pairs = shuffle(members, orgIndex + 901);
    for (let index = 0; index < Math.min(members.length, 16); index++) {
      const creator = pairs[index]!;
      await api(creator.client, "/api/v1/messaging/conversations", {
        organizationId,
        kind: "dm",
        emails: [pairs[(index + 1) % pairs.length]!.email],
      });
    }
  }
  if (members.length > 2) {
    for (let index = 0; index < 3; index++) {
      const selected = shuffle(members, orgIndex * 100 + index + 400);
      const creator = selected[0]!;
      const name = ["Launch coordination", "Customer feedback", "Planning circle"][index]!;
      const existing = await api<{ name: string; kind: string }[]>(
        creator.client,
        `/api/v1/messaging/conversations${query}`,
      );
      if (!existing.some((item) => item.kind === "group" && item.name === name))
        await api(creator.client, "/api/v1/messaging/conversations", {
          organizationId,
          kind: "group",
          name,
          emails: selected.slice(1, 4).map((member) => member.email),
        });
    }
  }

  const count = Math.min(8, Math.max(3, Math.ceil(members.length / 8)));
  await parallel(projects.slice(0, count), async (name, index) => {
    const creator = members[(index + 1) % members.length]!;
    const existing = await api<{ name: string }[]>(
      creator.client,
      `/api/v1/tasks/projects${query}`,
    );
    if (!existing.some((item) => item.name === name))
      await api(creator.client, "/api/v1/tasks/mutations", {
        organizationId,
        action: "createProject",
        name,
        description: `Shared planning and delivery for ${name.toLowerCase()}.`,
      });
  });
}
