import type { LoadOrganization } from "../types";
import { json, parallel, type Account } from "./client";

const names = [
  "Northstar Labs",
  "Meridian Health",
  "Cedar Commerce",
  "Atlas Logistics",
  "Brightside Energy",
  "Harbor Design",
  "Fieldwork Analytics",
  "Juniper Studio",
];
const weights = [60, 40, 30, 25, 20, 12, 8, 5];

export function sizes(total: number) {
  const targets = weights.map((weight) => (total * weight) / 200);
  const result = targets.map((target) => Math.max(1, Math.floor(target)));
  let sum = result.reduce((value, size) => value + size, 0);
  while (sum !== total) {
    const adding = sum < total;
    const candidates = result
      .map((size, index) => {
        let gap = -Infinity;
        if (adding) gap = targets[index]! - size;
        else if (size > 1) gap = size - targets[index]!;
        return { index, gap };
      })
      .sort((a, b) => b.gap - a.gap);
    result[candidates[0]!.index]! += adding ? 1 : -1;
    sum += adding ? 1 : -1;
  }
  return result;
}

export async function organization(members: Account[], index: number): Promise<LoadOrganization> {
  const owner = members[0]!;
  const slug = `load-${names[index]!.toLowerCase().replaceAll(" ", "-")}`;
  const existing = await json<{ id: string; slug: string; name: string }[]>(
    await owner.client.get("/api/auth/organization/list"),
  );
  const org =
    existing.find((item) => item.slug === slug) ??
    (await json<{ id: string; name: string }>(
      await owner.client.post("/api/auth/organization/create", {
        data: { name: names[index], slug },
      }),
    ));
  await parallel(members, async (member) => {
    const joined = await json<{ id: string }[]>(
      await member.client.get("/api/auth/organization/list"),
    );
    if (joined.some((item) => item.id !== org.id))
      throw new Error(`${member.email} already belongs to another organization.`);
    if (!joined.some((item) => item.id === org.id)) {
      const invitations = await json<{ id: string; email: string; status: string }[]>(
        await owner.client.get(`/api/auth/organization/list-invitations?organizationId=${org.id}`),
      );
      const invitation =
        invitations.find((item) => item.email === member.email && item.status === "pending") ??
        (await json<{ id: string }>(
          await owner.client.post("/api/auth/organization/invite-member", {
            data: { organizationId: org.id, email: member.email, role: "member" },
          }),
        ));
      await json(
        await member.client.post("/api/auth/organization/accept-invitation", {
          data: { invitationId: invitation.id },
        }),
      );
    }
    await json(
      await member.client.post("/api/auth/organization/set-active", {
        data: { organizationId: org.id },
      }),
    );
    member.organizationId = org.id;
  });
  return {
    id: org.id,
    slug,
    name: org.name,
    ownerEmail: owner.email,
    memberEmails: members.map((member) => member.email),
  };
}
