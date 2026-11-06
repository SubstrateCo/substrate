import type { WorkspaceReference } from "@startup-os/ui/messaging/entity-reference";

export const referenceFixtures: WorkspaceReference[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "task",
    label: "Review the onboarding flow",
    href: "/iframe.html?id=projects-scenes-tasks--project&viewMode=story",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    kind: "task",
    label: "Ship the launch checklist",
    href: "/iframe.html?id=projects-scenes-tasks--project&viewMode=story",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "project",
    label: "Workspace launch",
    href: "/iframe.html?id=projects-scenes-tasks--project&viewMode=story",
  },
  { id: "44444444-4444-4444-8444-444444444444", kind: "person", label: "Alex Morgan" },
  { id: "55555555-5555-4555-8555-555555555555", kind: "person", label: "Taylor Kim" },
];

export const referencedBody =
  "Hey @[person:44444444-4444-4444-8444-444444444444], can you review @[task:11111111-1111-4111-8111-111111111111] for @[project:33333333-3333-4333-8333-333333333333]?\n\n**Before launch:**\n- Review the mobile flow\n- Confirm the checklist";
