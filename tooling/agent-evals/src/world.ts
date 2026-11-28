import { createRepositories } from "@substrate/database";
import {
  member,
  organization,
  organizationApps,
  storedFiles,
  user,
} from "@substrate/database/schema";
import { ensureHumanActor, type Database } from "@substrate/database/trusted";

import { createHash } from "node:crypto";
import sharp from "sharp";

/**
 * A calendar date this many days from today, as YYYY-MM-DD. Today is the owner's local day, the
 * day the desktop tells the agent, so that "overdue" means the same to the seed and the agent.
 */
export function day(offset: number) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

const people = {
  priya: { name: "Priya Raman", role: "owner" },
  marcus: { name: "Marcus Feld", role: "member" },
  dana: { name: "Dana Whitlock", role: "member" },
  tom: { name: "Tom Okafor", role: "member" },
} as const;
export type PersonKey = keyof typeof people;

/**
 * A small company workspace with overlapping records: projects and tasks, CRM accounts, contacts
 * and deals, and channels with history. Every run gets its own organization
 * and users, so runs do not see each other.
 */
export async function seedWorld(db: Database) {
  const run = crypto.randomUUID().slice(0, 8);
  const organizationId = `eval-${run}`;
  await db
    .insert(organization)
    .values({ id: organizationId, name: "Kestrel Labs", slug: organizationId });
  await db
    .insert(organizationApps)
    .values((["tasks", "crm"] as const).map((appId) => ({ organizationId, appId, enabled: true })));
  /** One value for each person, made in a fixed order. */
  const forPeople = async <T>(make: (key: PersonKey) => Promise<T>) => ({
    priya: await make("priya"),
    marcus: await make("marcus"),
    dana: await make("dana"),
    tom: await make("tom"),
  });
  const users = await forPeople(async (key) => {
    const person = people[key];
    const userId = `${key}-${run}`;
    const email = `${key}.${run}@kestrellabs.example`;
    await db.insert(user).values({
      id: userId,
      name: person.name,
      email,
      emailVerified: true,
      lastOrganizationId: organizationId,
    });
    await db
      .insert(member)
      .values({ id: `${userId}-m`, userId, organizationId, role: person.role });
    return { userId, email, name: person.name };
  });
  const repositories = createRepositories(db);
  const as = await forPeople((key) =>
    repositories.forSession({ userId: users[key].userId, organizationId }),
  );
  const owner = as.priya;
  const actors = await forPeople(
    async (key) =>
      (await ensureHumanActor(db, { organizationId, userId: users[key].userId })).entityId,
  );

  // Projects and tasks.
  const projects: Record<string, string> = {};
  const tasks: Record<string, string> = {};
  const project = async (key: string, name: string, description: string) => {
    const { result: created } = await owner.projects.create({ name, description });
    for (const other of ["marcus", "dana", "tom"] as const)
      await owner.projects.share(created.entityId, actors[other], "edit");
    projects[key] = created.entityId;
    return created.entityId;
  };
  type TaskSeed = {
    key: string;
    title: string;
    status?: "not_started" | "in_progress" | "in_review" | "completed" | "canceled";
    priority?: "none" | "low" | "medium" | "high" | "urgent";
    assignee?: PersonKey;
    due?: string;
    description?: string;
  };
  const addTasks = async (projectKey: string, seeds: TaskSeed[]) => {
    for (const seed of seeds) {
      const { result: created } = await owner.tasks.create({
        projectEntityId: projects[projectKey]!,
        title: seed.title,
        status: seed.status ?? "not_started",
        priority: seed.priority ?? "none",
        description: seed.description ?? "",
        dueDate: seed.due ?? null,
        assigneeActorEntityId: seed.assignee ? actors[seed.assignee] : null,
      });
      tasks[seed.key] = created.entityId;
    }
  };
  await project(
    "website",
    "Website Relaunch",
    "New marketing site and checkout, live before the spring campaign.",
  );
  await addTasks("website", [
    {
      key: "homepageCopy",
      title: "Homepage copy rewrite",
      status: "in_progress",
      assignee: "tom",
      due: day(4),
      priority: "medium",
      description: "New headline, three value props and the customer quote block.",
    },
    {
      key: "pricingPage",
      title: "Pricing page redesign",
      assignee: "marcus",
      due: day(6),
      priority: "medium",
      description: "Three tiers with the annual toggle. Needs final numbers from sales.",
    },
    {
      key: "checkoutBug",
      title: "Fix checkout bug on mobile",
      status: "in_progress",
      assignee: "marcus",
      due: day(-2),
      priority: "high",
      description: "Apple Pay button does nothing on iOS Safari since the last deploy.",
    },
    {
      key: "seoAudit",
      title: "SEO audit",
      status: "completed",
      assignee: "marcus",
      due: day(-10),
      description: "Crawl report and redirect map for the old URLs.",
    },
    {
      key: "blogMigration",
      title: "Migrate blog posts",
      due: day(12),
      description: "Move 40 posts from the old CMS. Keep the slugs.",
    },
    {
      key: "analytics",
      title: "Set up analytics dashboards",
      assignee: "priya",
      due: day(-1),
      priority: "low",
      description: "Traffic and conversion dashboards for the launch review.",
    },
  ]);
  await project(
    "onboarding",
    "Customer Onboarding",
    "Repeatable onboarding for new customers in their first 30 days.",
  );
  await addTasks("onboarding", [
    {
      key: "emailSequence",
      title: "Write onboarding email sequence",
      status: "in_review",
      assignee: "dana",
      due: day(2),
      priority: "medium",
    },
    {
      key: "brightlineMsa",
      title: "Send Brightline MSA draft",
      assignee: "priya",
      due: day(3),
      priority: "high",
      description: "Legal template v4. Elena needs it before their board meeting.",
    },
    {
      key: "checklist",
      title: "Build onboarding checklist template",
      assignee: "tom",
      due: day(9),
    },
    {
      key: "trainingVideo",
      title: "Record admin training video",
      assignee: "marcus",
      due: day(15),
      priority: "low",
    },
  ]);
  await project("hiring", "Hiring", "Open roles and interview loops.");
  await addTasks("hiring", [
    {
      key: "backendRole",
      title: "Post senior backend engineer role",
      status: "completed",
      assignee: "priya",
      due: day(-14),
    },
    {
      key: "screenCandidates",
      title: "Screen backend candidates",
      status: "in_progress",
      assignee: "marcus",
      due: day(5),
      priority: "medium",
    },
    {
      key: "designContract",
      title: "Renew design contractor agreement",
      assignee: "priya",
      due: day(-3),
      priority: "medium",
    },
  ]);
  const oldSite = await project("oldSite", "Old Website", "The 2023 site. Kept for reference.");
  await addTasks("oldSite", [
    { key: "oldBanner", title: "Homepage banner refresh", status: "completed", assignee: "tom" },
  ]);
  await owner.projects.archive(oldSite);

  // CRM.
  const { result: pipeline } = await owner.crm.ensurePipeline();
  await owner.crm.configureStages(
    ["Lead", "Qualified", "Proposal", "Negotiation"].map((name, index) => ({
      id: pipeline[index]?.id,
      name,
    })),
  );
  const stages: Record<string, string> = {};
  for (const stage of await owner.crm.pipeline()) stages[stage.name] = stage.id;
  await owner.crm.updateSettings({ defaultCurrency: "USD" });
  const accounts: Record<string, string> = {};
  const contacts: Record<string, string> = {};
  const deals: Record<string, string> = {};
  const account = async (key: string, name: string, domain: string, summary: string) => {
    const { result: created } = await owner.crm.createAccount({
      name,
      domain,
      website: `https://${domain}`,
      summary,
    });
    accounts[key] = created.entityId;
  };
  const contact = async (
    key: string,
    input: { given: string; family: string; email: string; phone?: string; notes?: string },
    affiliation?: { account: string; title: string; primary?: boolean },
  ) => {
    const { result: created } = await owner.contacts.createContact({
      displayName: `${input.given} ${input.family}`,
      givenName: input.given,
      familyName: input.family,
      notes: input.notes ?? null,
    });
    contacts[key] = created.entityId;
    await owner.contacts.mutateContactDetail({
      action: "addIdentifier",
      organizationId,
      contactEntityId: created.entityId,
      type: "email",
      value: input.email,
      label: "Work",
      isPrimary: true,
    });
    if (input.phone)
      await owner.contacts.mutateContactDetail({
        action: "addIdentifier",
        organizationId,
        contactEntityId: created.entityId,
        type: "phone",
        value: input.phone,
        label: "Work",
        isPrimary: true,
      });
    if (affiliation)
      await owner.crm.setAffiliation({
        contactEntityId: created.entityId,
        accountEntityId: accounts[affiliation.account]!,
        title: affiliation.title,
        isPrimary: affiliation.primary ?? false,
      });
  };
  await account(
    "brightline",
    "Brightline Logistics",
    "brightline.example",
    "Regional freight broker, 300 staff. Evaluating us for dispatcher scheduling.",
  );
  await account(
    "harbor",
    "Harbor & Finch",
    "harborfinch.example",
    "Boutique architecture studio. Small pilot.",
  );
  await account(
    "calloway",
    "Calloway Dental Group",
    "callowaydental.example",
    "Five dental practices in one group.",
  );
  await account(
    "brightside",
    "Brightside Media",
    "brightside.example",
    "Video agency. Old lead, went quiet in the autumn.",
  );
  await contact(
    "elena",
    {
      given: "Elena",
      family: "Vasquez",
      email: "elena.vasquez@brightline.example",
      phone: "+14155550134",
      notes: "Prefers short emails. Decision maker.",
    },
    { account: "brightline", title: "VP Operations", primary: true },
  );
  await contact(
    "raj",
    { given: "Raj", family: "Patel", email: "raj.patel@brightline.example" },
    { account: "brightline", title: "IT Manager" },
  );
  await contact(
    "nora",
    { given: "Nora", family: "Finch", email: "nora@harborfinch.example" },
    { account: "harbor", title: "Partner", primary: true },
  );
  await contact(
    "sam",
    {
      given: "Sam",
      family: "Calloway",
      email: "sam@callowaydental.example",
      phone: "+13125550177",
    },
    { account: "calloway", title: "Managing Director", primary: true },
  );
  await contact(
    "elaine",
    { given: "Elaine", family: "Vasquez", email: "elaine@brightside.example" },
    { account: "brightside", title: "Producer", primary: true },
  );
  const deal = async (
    key: string,
    input: {
      title: string;
      account: string;
      contact: string;
      stage: string;
      amount: string;
      close: string;
      summary: string;
    },
  ) => {
    const { result: created } = await owner.crm.createDeal({
      title: input.title,
      accountEntityId: accounts[input.account]!,
      contactEntityIds: [contacts[input.contact]!],
      primaryContactEntityId: contacts[input.contact]!,
      stageId: stages[input.stage]!,
      amount: input.amount,
      currency: "USD",
      expectedCloseDate: input.close,
      summary: input.summary,
    });
    deals[key] = created.entityId;
  };
  await deal("brightline", {
    title: "Brightline annual plan",
    account: "brightline",
    contact: "elena",
    stage: "Proposal",
    amount: "48000",
    close: day(21),
    summary: "40 seats on the annual plan at 1,200 USD per seat.",
  });
  await deal("harbor", {
    title: "Harbor & Finch pilot",
    account: "harbor",
    contact: "nora",
    stage: "Qualified",
    amount: "12000",
    close: day(14),
    summary: "Three month pilot for the studio team.",
  });
  await deal("calloway", {
    title: "Calloway Dental rollout",
    account: "calloway",
    contact: "sam",
    stage: "Negotiation",
    amount: "30000",
    close: day(30),
    summary: "Rollout to all five locations.",
  });
  await deal("brightside", {
    title: "Brightside Media starter",
    account: "brightside",
    contact: "elaine",
    stage: "Lead",
    amount: "6000",
    close: day(60),
    summary: "Starter plan. No reply since the autumn.",
  });
  const interaction = async (
    contactKey: string,
    kind: "email" | "meeting" | "call" | "note",
    daysAgo: number,
    summary: string,
  ) => {
    const occurredAt = new Date();
    occurredAt.setUTCDate(occurredAt.getUTCDate() - daysAgo);
    occurredAt.setUTCHours(15, 0, 0, 0);
    await owner.contactInteractions.createInteraction({
      contactEntityId: contacts[contactKey]!,
      kind,
      summary,
      occurredAt,
      endedAt: null,
    });
  };
  await interaction(
    "elena",
    "meeting",
    12,
    "Demo for Elena and Raj. Elena liked the dispatcher view. Raj asked about SSO and data residency.",
  );
  await interaction(
    "elena",
    "call",
    5,
    "Pricing call with Elena. She pushed for a discount on a two year term. We said we would come back with options.",
  );
  await interaction(
    "raj",
    "email",
    8,
    "Sent Raj the SSO setup guide and the security questionnaire.",
  );
  await interaction(
    "sam",
    "meeting",
    7,
    "On-site visit with Sam at the Lincoln Park practice. He wants all five locations live before summer.",
  );
  await interaction(
    "nora",
    "call",
    9,
    "Intro call with Nora. Team of 14. Wants to try it on one project first.",
  );

  // Conversations.
  const others = (["marcus", "dana", "tom"] as const).map((key) => users[key].email);
  const conversations: Record<string, string> = {};
  const messages: Record<string, string> = {};
  const channel = async (key: string, name: string) => {
    const { result: created } = await owner.messaging.createConversation({
      kind: "channel",
      name,
      emails: others,
    });
    conversations[key] = created.id;
  };
  const say = async (
    key: string,
    author: PersonKey,
    conversation: string,
    body: string,
    replyTo?: string,
  ) => {
    const { result: sent } = await as[author].messaging.sendMessage(
      conversations[conversation]!,
      body,
      replyTo ? messages[replyTo] : undefined,
    );
    messages[key] = sent.id;
  };
  await channel("general", "general");
  await channel("website", "website");
  await channel("sales", "sales");
  await say(
    "g1",
    "tom",
    "general",
    "Office is closed Friday for the building inspection. Work from home.",
  );
  await say("g2", "dana", "general", "Reminder: expense reports are due at the end of the month.");
  await say(
    "w1",
    "tom",
    "website",
    "Homepage copy draft is in review. I still need the customer quote from Brightline before I can finish the quote block.",
  );
  await say(
    "w2",
    "marcus",
    "website",
    `Update on @[task:${tasks.checkoutBug}]: the mobile checkout bug comes from the payment SDK update last week. I can not test the fix until I get the staging credentials for the payment sandbox. Tom, you set that account up, can you send them?`,
  );
  await say(
    "w3",
    "tom",
    "website",
    "I will dig them out. Might be in the old password vault.",
    "w2",
  );
  await say(
    "w4",
    "marcus",
    "website",
    "Pricing page is blocked until sales confirms the final tier prices.",
  );
  await say(
    "w5",
    "dana",
    "website",
    "Tier prices are final: Starter 600, Team 1,200, Scale 2,000 per seat per year.",
    "w4",
  );
  await say(
    "s1",
    "dana",
    "sales",
    "Spoke with Elena at Brightline this morning. They want to go from 40 seats to 65 seats on the annual plan. Their legal team needs our MSA by the 14th, or it slips to next quarter.",
  );
  await say(
    "s2",
    "dana",
    "sales",
    "Harbor & Finch: Nora gave a verbal yes on the pilot. Paperwork should follow this week.",
  );
  await say(
    "s3",
    "dana",
    "sales",
    "Calloway Dental wants a reference customer in healthcare before they sign. Do we have one?",
  );
  await say(
    "s4",
    "marcus",
    "sales",
    "We could ask Lakeview Pediatrics, they have been happy since the spring.",
    "s3",
  );
  await say(
    "s5",
    "dana",
    "sales",
    "New inbound lead: Jordan Ames, Director of Operations at Pinecrest Clinics, asked for a demo. 8 clinics, about 120 front desk staff, scheduling is all spreadsheets today. Lakeview Pediatrics referred them. Email is jordan.ames@pinecrestclinics.example, direct line 617-555-0142. No budget discussed yet.",
  );
  // Files. The facts the scenarios ask for are only in the files, not in the message text.
  const files = new Map<string, Uint8Array>();
  const attachments: Record<string, string> = {};
  const attach = async (
    key: string,
    author: PersonKey,
    conversation: string,
    body: string,
    file: { name: string; type: string; bytes: Uint8Array },
    replyTo?: string,
  ) => {
    const id = crypto.randomUUID();
    const objectKey = `evals/${run}/${id}`;
    files.set(objectKey, file.bytes);
    await db.insert(storedFiles).values({
      id,
      organizationId,
      uploadedBy: users[author].userId,
      purpose: "file",
      filename: file.name,
      contentType: file.type,
      size: file.bytes.length,
      objectKey,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
    });
    const { result: sent } = await as[author].messaging.sendMessage(
      conversations[conversation]!,
      body,
      replyTo ? messages[replyTo] : undefined,
      undefined,
      [id],
    );
    messages[key] = sent.id;
    attachments[key] = sent.attachments.at(0)?.id ?? "";
  };
  const text = (value: string) => new TextEncoder().encode(value);
  await channel("bugs", "bugs");
  await attach(
    "b1",
    "tom",
    "bugs",
    "Pulled the log from the staging box for the checkout problem. Attached.",
    {
      name: "checkout-staging.log",
      type: "text/plain",
      bytes: text(
        [
          "2026-11-24T09:12:03Z INFO  checkout session start platform=ios-safari",
          "2026-11-24T09:12:04Z INFO  payment sheet requested method=apple_pay",
          "2026-11-24T09:12:04Z WARN  sandbox credential check: key sk_sandbox_4f2a expires in 0 days",
          "2026-11-24T09:12:05Z ERROR PaymentSheetError: sandbox API key expired on 2026-11-20",
          "2026-11-24T09:12:05Z ERROR merchant identifier merchant.example.kestrel.staging is not registered for this key",
          "2026-11-24T09:12:05Z INFO  payment sheet dismissed result=failed",
          "2026-11-24T09:14:41Z INFO  checkout session start platform=android-chrome",
          "2026-11-24T09:14:43Z INFO  payment completed method=card",
        ].join("\n"),
      ),
    },
  );
  await attach(
    "b2",
    "marcus",
    "bugs",
    "This is what customers see on iPhone when they tap the button.",
    {
      name: "apple-pay-error.png",
      type: "image/png",
      bytes: new Uint8Array(
        await sharp(
          Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300"><rect width="640" height="300" fill="#ffffff"/><rect x="40" y="40" width="560" height="220" rx="16" fill="#fdecec" stroke="#c0392b" stroke-width="3"/><text x="320" y="120" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#c0392b" text-anchor="middle">Apple Pay is not available</text><text x="320" y="170" font-family="Arial, sans-serif" font-size="24" fill="#333333" text-anchor="middle">Please try another payment method.</text><text x="320" y="220" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#333333" text-anchor="middle">Error code PAY-4012</text></svg>`,
          ),
        )
          .png()
          .toBuffer(),
      ),
    },
  );
  await attach(
    "s6",
    "dana",
    "sales",
    "Jordan sent over the Pinecrest clinic list with front desk headcount.",
    {
      name: "pinecrest-clinics.csv",
      type: "text/csv",
      bytes: text(
        [
          "clinic,city,front_desk_staff",
          "Riverside,Springfield,31",
          "Oak Hill,Springfield,18",
          "Harbor View,Salem,16",
          "Maple Court,Salem,14",
          "Northgate,Dover,12",
          "Lakeside,Dover,11",
          "Elm Street,Concord,10",
          "Pine Ridge,Concord,8",
        ].join("\n"),
      ),
    },
    "s5",
  );
  const { result: dm } = await owner.messaging.createConversation({
    kind: "dm",
    emails: [users.dana.email],
  });
  conversations.danaDm = dm.id;
  await say(
    "d1",
    "dana",
    "danaDm",
    "Can we do our pipeline review on Thursday at 2 instead of Wednesday? I have the dentist.",
  );
  await say("d2", "priya", "danaDm", "Thursday at 2 works.");

  return {
    run,
    organizationId,
    users,
    actors,
    as,
    owner,
    projects,
    tasks,
    stages,
    accounts,
    contacts,
    deals,
    conversations,
    messages,
    /** Stored bytes by object key, for the agent file tools. */
    files,
    /** Attachment IDs of the seeded files, by the key of their message. */
    attachments,
  };
}
export type World = Awaited<ReturnType<typeof seedWorld>>;
