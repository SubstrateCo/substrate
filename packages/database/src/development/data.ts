export const developmentTeams = [
  {
    id: "dev-northstar",
    name: "Northstar Labs",
    slug: "dev-northstar",
    channel: "product-engineering",
    people: [
      { id: "dev-alice", name: "Alice Morgan", email: "alice@northstar.test", role: "owner" },
      { id: "dev-bob", name: "Bob Chen", email: "bob@northstar.test", role: "admin" },
      { id: "dev-carol", name: "Carol Rivera", email: "carol@northstar.test", role: "member" },
    ],
    contacts: [
      { name: "Jamie Park — Cedar Analytics", email: "jamie@cedar.test" },
      { name: "Morgan Reed — Harbor Health", email: "morgan@harbor.test" },
    ],
    projects: [
      {
        name: "Customer portal",
        description: "Ship a simpler onboarding and account experience for our pilot customers.",
        tasks: [
          "Confirm Cedar's onboarding requirements",
          "Implement the workspace invitation flow",
          "Review portal accessibility with the pilot team",
          "Publish the approved account navigation",
          "Retire the legacy welcome modal",
        ],
        subtasks: ["Handle expired invitation links", "Add invitation error recovery"],
      },
      {
        name: "Autumn launch",
        description:
          "Coordinate product readiness, customer feedback, and the Orbit Studio launch campaign.",
        tasks: [
          "Collect Harbor's pilot feedback",
          "Prepare the customer portal demo",
          "Review the launch readiness checklist",
          "Approve the product announcement scope",
          "Cancel the separate launch microsite",
        ],
        subtasks: ["Prepare a clean demo workspace", "Rehearse the onboarding walkthrough"],
      },
    ],
  },
  {
    id: "dev-orbit",
    name: "Orbit Studio",
    slug: "dev-orbit",
    channel: "design-studio",
    people: [
      { id: "dev-dana", name: "Dana Patel", email: "dana@orbit.test", role: "owner" },
      { id: "dev-eli", name: "Eli Brooks", email: "eli@orbit.test", role: "admin" },
      { id: "dev-farah", name: "Farah Ahmed", email: "farah@orbit.test", role: "member" },
    ],
    contacts: [
      { name: "Taylor Ellis — Fieldwork Media", email: "taylor@fieldwork.test" },
      { name: "Sam Okafor — Summit Events", email: "sam@summit.test" },
    ],
    projects: [
      {
        name: "Brand refresh",
        description:
          "Refresh the visual identity and prepare accessible assets for the joint product launch.",
        tasks: [
          "Confirm the brand rollout requirements",
          "Create the updated campaign asset set",
          "Review contrast and typography with Fieldwork",
          "Approve the new visual direction",
          "Drop the unused illustration concept",
        ],
        subtasks: ["Prepare light and dark variants", "Export the approved social formats"],
      },
      {
        name: "Partner campaign",
        description: "Prepare the joint Northstar campaign and coordinate the Summit launch event.",
        tasks: [
          "Confirm Summit's event requirements",
          "Draft the joint product launch campaign",
          "Review the partner messaging checklist",
          "Approve the campaign audience and channels",
          "Cancel the duplicate event landing page",
        ],
        subtasks: ["Draft the launch email copy", "Prepare the event speaker brief"],
      },
    ],
  },
] as const;

export const developmentAgent = {
  name: (personName: string) => `${personName.split(" ")[0]}'s workspace assistant`,
  instructions:
    "Help me review assigned work, summarize project discussions, and prepare clear next steps. Keep source references and ask before publishing changes.",
  harness: "opencode",
  enabled: false,
} as const;

export const developmentWork = {
  stages: [
    { status: "not_started", priority: "low", dueInDays: -4 },
    { status: "in_progress", priority: "high", dueInDays: -1 },
    { status: "in_review", priority: "urgent", dueInDays: 2 },
    { status: "completed", priority: "medium", dueInDays: 5 },
    { status: "canceled", priority: "none", dueInDays: 8 },
  ],
  description: (title: string) =>
    `${title}. Record the acceptance criteria, review notes, and final decision here before closing this work.`,
  progressComment: "The requirements are agreed. Please add your progress and any blockers here.",
  followup: {
    title: "Triage follow-up feedback",
    description: "Pick an owner at the next team planning session.",
    status: "not_started",
  },
  links: [
    { source: 0, relation: "blocks", target: 1 },
    { source: 1, relation: "blocks", target: 2 },
    { source: 5, relation: "duplicates", target: 0 },
    { source: 5, relation: "relates_to", target: 2 },
  ],
  crossProjectLink: { source: 2, relation: "blocks", target: 1 },
  subtasks: [
    { status: "completed", priority: "medium", dueInDays: 1 },
    { status: "in_progress", priority: "medium", dueInDays: 2 },
  ],
  reviewComment: (personId: string, taskId: string, projectId: string) =>
    `@[person:${personId}] please confirm the acceptance criteria from @[task:${taskId}] in @[project:${projectId}]. Keep the review notes on this task.`,
  reviewerReply: "The core flow is working. Error recovery is the remaining step before review.",
  feedbackTask: {
    title: "Address the walkthrough feedback",
    description:
      "Keep the confirmation visible and shorten the empty-state copy. Review the original discussion for context.",
    status: "completed",
    priority: "medium",
  },
} as const;

export interface DevelopmentMessage {
  key: string;
  author: number;
  body: string;
  replyTo?: string;
  reactions?: readonly { author: number; emoji: string }[];
}

export function developmentConversations(
  team: (typeof developmentTeams)[number],
  actors: readonly { entityId: string }[],
  tasks: readonly { entityId: string; title: string }[],
) {
  return {
    updates: {
      name: "team-updates",
      messages: [
        {
          key: "welcome",
          author: 0,
          body: `Welcome to ${team.name}! Project boards are ready. Please review your assigned tasks before our planning session.`,
          reactions: [
            { author: 2, emoji: "👍" },
            { author: 1, emoji: "🎉" },
            { author: 0, emoji: "👍" },
          ],
        },
        {
          key: "implementation",
          author: 1,
          body: "I have started the implementation milestone and will post a progress update today.",
        },
        {
          key: "assets",
          author: 2,
          body: "Release assets are ready for review. Feedback is welcome.",
        },
        {
          key: "assignments",
          author: 1,
          body: "The task assignments look good to me.",
          replyTo: "welcome",
        },
        {
          key: "review",
          author: 1,
          body: `@[person:${actors[2]!.entityId}] could you review @[task:${tasks[1]!.entityId}]? The first milestone is ready for a walkthrough.`,
          reactions: [
            { author: 2, emoji: "👀" },
            { author: 0, emoji: "✅" },
          ],
        },
        {
          key: "feedback",
          author: 2,
          body: "I tested the happy path. Two small changes: keep the confirmation visible and shorten the empty-state copy.",
          replyTo: "review",
        },
        {
          key: "feedback-resolved",
          author: 1,
          body: "Both changes are in. I also checked the keyboard flow and the narrow layout.",
          replyTo: "review",
        },
        {
          key: "review-approved",
          author: 0,
          body: "Reviewed and approved. Let’s include this in the Friday demo.",
          replyTo: "review",
        },
        {
          key: "planning",
          author: 2,
          body: `Release checklist: @[task:${tasks[2]!.entityId}]. @[person:${actors[0]!.entityId}] can you confirm the final review slot?`,
          reactions: [{ author: 0, emoji: "📌" }],
        },
        {
          key: "review-slot",
          author: 0,
          body: "Thursday at 14:00 works. Please bring the latest screenshots and any open questions.",
          replyTo: "planning",
        },
        {
          key: "demo-notes",
          author: 1,
          body: "I’ll bring the implementation notes and a short demo.",
          replyTo: "planning",
        },
        ...[
          "Today’s focus: close the review feedback before starting new work. Flag blockers in a thread so we can help.",
          "Quick progress update: the core flow is complete. I’m checking edge cases and error recovery next.",
          "The updated assets are ready. I checked contrast, spacing, and the light and dark variants.",
          "Customer feedback: the simpler navigation is much easier to follow. Let’s keep the release scope focused.",
          "All review comments have owners now. No new blockers from me.",
          "Friday demo agenda: onboarding, project handoff, and partner launch readiness. Add questions below.",
          "Thanks everyone! The release checklist is looking good. We’ll make the final go/no-go decision after the demo.",
        ].map((body, index) => ({
          key: `update-${index}`,
          author: index % 3,
          body,
          reactions: [{ author: (index + 1) % 3, emoji: ["🙌", "🚀", "✅"][index % 3]! }],
        })),
      ],
    },
    project: {
      name: team.channel,
      messages: tasks.slice(0, 5).flatMap((task, index) => [
        {
          key: `task-${index}`,
          author: index % 3,
          body: `Work update on @[task:${task.entityId}]: ${task.title}. Please keep review notes in this thread.`,
          reactions: [{ author: (index + 2) % 3, emoji: "👍" }],
        },
        {
          key: `task-review-${index}`,
          author: (index + 1) % 3,
          body: "I’ve checked the latest changes. The scope looks right; I’ll add my detailed notes after the walkthrough.",
          replyTo: `task-${index}`,
        },
      ]),
    },
    dm: [
      {
        key: "review-request",
        author: 0,
        body: "Can you review the high-priority task before tomorrow's sync?",
      },
      {
        key: "review-confirmed",
        author: 1,
        body: "Yes. I will add my notes to the project this afternoon.",
      },
    ],
  };
}

// Author indexes: Northstar owner, Orbit owner, Northstar member, Orbit member.
export const developmentPartner = {
  channel: { kind: "channel", name: "Partner launch", shareHistory: true, private: true },
  dm: { kind: "dm", shareHistory: true },
  messages: [
    {
      key: "welcome",
      author: 0,
      body: "Welcome, Orbit team! Let's use this shared channel to coordinate the autumn launch.",
    },
    {
      key: "brand-update",
      author: 1,
      body: "Thanks, Alice. Our brand refresh and campaign work are underway.",
    },
    {
      key: "copy-review",
      author: 2,
      body: "The draft release assets are ready. Can you review the campaign copy?",
      reactions: [
        { author: 1, emoji: "👀" },
        { author: 3, emoji: "✅" },
      ],
    },
    {
      key: "copy-feedback",
      author: 3,
      body: "I will review the copy today and share feedback here.",
      replyTo: "copy-review",
    },
    {
      key: "copy-resolved",
      author: 2,
      body: "I’ve incorporated the copy feedback. The final asset review is Thursday, with the joint demo on Friday.",
      replyTo: "copy-review",
    },
    {
      key: "launch-plan",
      author: 1,
      body: "Partner launch plan: Orbit owns the campaign creative; Northstar owns the product demo. Let’s use this thread for launch-day dependencies.",
      reactions: [{ author: 2, emoji: "🚀" }],
    },
    {
      key: "demo-ready",
      author: 0,
      body: "Confirmed. Our demo environment will be ready by Thursday afternoon.",
      replyTo: "launch-plan",
    },
    {
      key: "creative-approved",
      author: 3,
      body: "Campaign creative is approved. I’ll share the final messaging checklist after the review.",
      replyTo: "launch-plan",
    },
  ] satisfies DevelopmentMessage[],
  directMessages: [
    {
      key: "review-request",
      author: 0,
      body: "Are we still on for the partner launch review on Friday?",
    },
    {
      key: "review-confirmed",
      author: 1,
      body: "Confirmed. I will bring the latest campaign plan.",
    },
  ] satisfies DevelopmentMessage[],
} as const;
