/** A seeded PRNG (xmur3 hash + sfc32), so a VU behaves the same in every run. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    const next = () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
  }

  /** Uniform in [0, 1). */
  next() {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  between(min: number, max: number) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max]. */
  int(min: number, max: number) {
    return Math.floor(this.between(min, max + 1));
  }

  chance(probability: number) {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T | undefined {
    return items.length ? items[Math.floor(this.next() * items.length)] : undefined;
  }

  /** Picks with probability proportional to `weight(item)`. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    const total = items.reduce((sum, item) => sum + Math.max(weight(item), 0), 0);
    if (total <= 0) return undefined;
    let roll = this.next() * total;
    for (const item of items) {
      roll -= Math.max(weight(item), 0);
      if (roll < 0) return item;
    }
    return items.at(-1);
  }

  normal() {
    const u = 1 - this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }

  /** Log-normal with the given median; `spread` is sigma of the underlying normal. */
  logNormal(median: number, spread: number, min = 0, max = Infinity) {
    return Math.min(max, Math.max(min, median * Math.exp(spread * this.normal())));
  }
}

export const maxConcurrentUsers = 200;

export type FlowName =
  | "readMessages"
  | "writeMessages"
  | "tasks"
  | "search"
  | "notifications"
  | "connectedWork"
  | "crm"
  | "rare";

export type ActivityBand = "hot" | "warm" | "cold";

const coverageActions = [
  "startConversation",
  "manageMembers",
  "joinChannel",
  "leaveChannel",
  "deleteOwnConversation",
  "createProject",
  "updateProject",
  "shareProject",
  "revokeShare",
  "uploadToTask",
  "uploadToMessage",
  "browseAttachments",
  "inviteExternal",
  "managePending",
  "browseSettings",
  "deleteOwnProject",
  "changeProjectIcon",
  "administerOrganization",
  "transferOwnership",
  "uploadAvatar",
];

export const observationValues = {
  organization: ["hot", "warm", "cold"],
  user: ["hot", "warm", "cold"],
  resource: ["hot", "warm", "cold"],
  coverage_action_attempted: coverageActions,
  coverage_action_omitted: coverageActions,
};

export function averageSignedInUsers(presenceMs: number, durationMs: number) {
  return durationMs > 0 ? presenceMs / durationMs : 0;
}

/** Zero-based Zipf rank. The nonzero tail keeps quiet accounts and records reachable. */
export function activityWeight(rank: number, count: number) {
  return Math.pow(Math.min(Math.max(0, rank), Math.max(0, count - 1)) + 1, -1.15);
}

export function activityBand(rank: number, count: number): ActivityBand {
  const percentile = rank / Math.max(1, count);
  if (percentile < 0.1) return "hot";
  return percentile < 0.4 ? "warm" : "cold";
}

export function resourceBand<T>(
  items: readonly T[],
  seed: string,
  id: (item: T) => string,
  selected: T,
): ActivityBand {
  const ranked = [...items].sort(
    (a, b) =>
      new Rng(`resource:${seed}:${id(b)}`).next() - new Rng(`resource:${seed}:${id(a)}`).next(),
  );
  return activityBand(ranked.indexOf(selected), ranked.length);
}

const flowNames: FlowName[] = [
  "readMessages",
  "writeMessages",
  "tasks",
  "search",
  "notifications",
  "connectedWork",
  "crm",
  "rare",
];

const roles = ["chatty", "taskFocused", "lurker", "balanced"] as const;
const organizations = ["collaborative", "delivery", "sales"] as const;
const roleBias: Record<(typeof roles)[number], Partial<Record<FlowName, number>>> = {
  chatty: { writeMessages: 2.4, readMessages: 1.4, tasks: 0.5 },
  taskFocused: { tasks: 3, connectedWork: 1.8, writeMessages: 0.6 },
  lurker: { readMessages: 2, writeMessages: 0.2, tasks: 0.5, notifications: 1.5 },
  balanced: {},
};
const organizationBias: Record<
  (typeof organizations)[number],
  Partial<Record<FlowName, number>>
> = {
  collaborative: { readMessages: 1.5, writeMessages: 1.6 },
  delivery: { tasks: 2, connectedWork: 1.7 },
  sales: { crm: 4, search: 1.4, connectedWork: 1.3 },
};

export function organizationProfile(slug: string) {
  const random = new Rng(`organization:${slug}`);
  return {
    role: random.pick(organizations)!,
    // Truncated Pareto. Activity changes time present, not human typing speed.
    activity: Math.min(1, 0.15 / Math.pow(1 - random.next(), 0.8)),
  };
}

export function userProfile(email: string, organizationSlug: string) {
  const organization = organizationProfile(organizationSlug);
  const random = new Rng(`person:${organizationSlug}:${email}`);
  const role = random.pick(roles)!;
  const activity = Math.min(1, 0.08 / Math.pow(1 - random.next(), 0.9));
  return {
    role,
    activity,
    organizationActivity: organization.activity,
    tempo: random.between(0.85, 1.15),
    typingCps: random.between(4, 7),
    readingCps: random.between(25, 45),
    awayChance: 0.06,
    // SAFETY: flowNames contains every FlowName; each bias is filled with a numeric default.
    flowBias: Object.fromEntries(
      flowNames.map((name) => [
        name,
        (roleBias[role][name] ?? 1) * (organizationBias[organization.role][name] ?? 1),
      ]),
    ) as Record<FlowName, number>,
  };
}

interface Account {
  email: string;
  organizationId: string;
}

interface OrganizationIdentity {
  id: string;
  slug: string;
}

export function organizationSlug(
  organizationId: string,
  organizations: readonly OrganizationIdentity[],
) {
  const organization = organizations.find((row) => row.id === organizationId);
  if (!organization) throw new Error(`Missing load organization ${organizationId}`);
  return organization.slug;
}

/** Weighted, stable permutation without replacement: one account per concurrent slot. */
export function rankUsers<T extends Account>(
  users: readonly T[],
  organizations: readonly OrganizationIdentity[],
): T[] {
  return users
    .map((user) => {
      const slug = organizationSlug(user.organizationId, organizations);
      const profile = userProfile(user.email, slug);
      const roll = new Rng(`slot:${slug}:${user.email}`).next();
      return {
        user,
        score: -Math.log(1 - roll) / (profile.activity * profile.organizationActivity),
      };
    })
    .sort((a, b) => a.score - b.score || a.user.email.localeCompare(b.user.email))
    .map(({ user }) => user);
}

export function selectUser<T extends Account>(
  users: readonly T[],
  slot: number,
  organizations: readonly OrganizationIdentity[],
): T {
  const maximum = Math.min(users.length, maxConcurrentUsers);
  if (!Number.isInteger(slot) || slot < 1 || slot > maximum)
    throw new Error(
      `No unique load account for slot ${slot} (maximum ${Math.min(users.length, maxConcurrentUsers)})`,
    );
  return rankUsers(users, organizations)[slot - 1]!;
}

/** Shared with the runtime so the occupancy estimate measures the actual pacing model. */
export function offlineDuration(
  profile: Pick<ReturnType<typeof userProfile>, "activity" | "organizationActivity">,
  random: Rng,
) {
  const presence = profile.activity * profile.organizationActivity;
  return Math.min(
    60 * 60_000,
    random.logNormal(3 * 60_000, 0.5, 60_000, 10 * 60_000) / Math.pow(presence, 0.75),
  );
}

export function sessionDuration(
  profile: Pick<ReturnType<typeof userProfile>, "activity">,
  random: Rng,
) {
  return (
    random.logNormal(13 * 60_000, 0.3, 8 * 60_000, 20 * 60_000) * Math.pow(profile.activity, 0.2)
  );
}

/** Renewal-cycle occupancy, not a claim that all account slots are signed in concurrently. */
export function estimateActiveFraction<T extends Account>(
  users: readonly T[],
  organizations: readonly OrganizationIdentity[],
  samples = 1000,
) {
  if (!users.length || samples < 1) throw new Error("Occupancy needs accounts and samples");
  let total = 0;
  for (const user of users) {
    const slug = organizationSlug(user.organizationId, organizations);
    const profile = userProfile(user.email, slug);
    const random = new Rng(`occupancy:${slug}:${user.email}`);
    let active = 0;
    let offline = 0;
    for (let sample = 0; sample < samples; sample++) {
      active += sessionDuration(profile, random);
      offline += offlineDuration(profile, random);
    }
    total += active / (active + offline);
  }
  return total / users.length;
}

/** Caller supplies only accessible rows. Shared hotness plus personal context; 12% exploration. */
export function selectResource<T>(
  items: readonly T[],
  options: {
    seed: string;
    random: Rng;
    id: (item: T) => string;
    relevance?: (item: T) => number;
  },
): T | undefined {
  // Response order can vary when fixture provisioning runs in parallel.
  const ordered = [...items].sort((a, b) => options.id(a).localeCompare(options.id(b)));
  if (options.random.chance(0.12)) return options.random.pick(ordered);
  const ranked = ordered
    .map((item) => ({
      item,
      score: new Rng(`resource:${options.seed}:${options.id(item)}`).next(),
    }))
    .sort((a, b) => b.score - a.score);
  const weighted = ranked.map(({ item }, rank) => ({ item, rank }));
  return options.random.weighted(
    weighted,
    ({ item, rank }) =>
      activityWeight(rank, ranked.length) *
      Math.min(12, Math.max(0.1, options.relevance?.(item) ?? 1)),
  )?.item;
}
