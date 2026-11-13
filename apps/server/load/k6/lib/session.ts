import {
  activityBand,
  offlineDuration,
  organizationProfile,
  organizationSlug,
  sessionDuration,
  userProfile,
} from "../../workload.ts";
import type { Flow } from "../flows/flow.ts";
import { workflowOutcome } from "../flows/flow.ts";
import { mount, resetCache, settleCache } from "./client-cache.ts";
import { config, plannedEndMs } from "./config.ts";
import { organizations, password, userOf, users } from "./data.ts";
import { trace } from "./debug.ts";
import { call, clearCookies, setOrganization } from "./http.ts";
import { keys } from "./keys.ts";
import { beginFlow, endFlow, recordObservation, startPresence, stopPresence } from "./metrics.ts";
import { away, idle, SessionOver, setDeadline, think } from "./pacing.ts";
import { persona, rng } from "./persona.ts";
import { connectRealtime, disconnectRealtime } from "./realtime.ts";
import { mountFrame } from "./screens/frame.ts";
import { openConversation, showMessaging } from "./screens/messaging.ts";
import { resetTaskScreen } from "./screens/tasks.ts";
import { createWorld, joinedConversations, type World } from "./world.ts";
import exec from "k6/execution";

const minute = 60_000;
let cohorts: { organization: string; user: string } | undefined;

function offlineLength() {
  return offlineDuration(persona, rng);
}

/** Signs in and opens the remembered workspace, switching to the user's own if it differs. */
async function signIn(): Promise<World | null> {
  const user = userOf(exec.vu.idInTest);
  resetCache();
  resetTaskScreen();
  clearCookies();
  trace(
    "session",
    `sign in ${user.email} (${persona.role}, activity ${persona.activity.toFixed(2)})`,
  );
  if (!(await call("auth.signIn", { email: user.email, password }))) return null;
  startPresence();
  setOrganization(user.organizationId);
  // The root route loads the session once; the frame then keeps it (staleTime Infinity).
  const session = await mount(
    keys.session,
    () => call<{ session: { activeOrganizationId: string | null } }>("session"),
    { staleTime: Infinity, frame: true },
  );
  if (!session) {
    await signOut();
    return null;
  }
  if (session.session.activeOrganizationId !== user.organizationId)
    if (!(await call("auth.setActive", { organizationId: user.organizationId }))) {
      await signOut();
      return null;
    }
  const slug = organizationSlug(user.organizationId, organizations);
  const orgRank = [...organizations].sort(
    (a, b) =>
      organizationProfile(b.slug).activity - organizationProfile(a.slug).activity ||
      a.slug.localeCompare(b.slug),
  );
  const peers = [...users]
    .filter((row) => row.organizationId === user.organizationId)
    .sort(
      (a, b) =>
        userProfile(b.email, slug).activity - userProfile(a.email, slug).activity ||
        a.email.localeCompare(b.email),
    );
  cohorts = {
    organization: activityBand(
      orgRank.findIndex((row) => row.id === user.organizationId),
      orgRank.length,
    ),
    user: activityBand(
      peers.findIndex((row) => row.userId === user.userId),
      peers.length,
    ),
  };
  return createWorld(user);
}

async function signOut() {
  disconnectRealtime();
  try {
    await settleCache();
    if (!(await call("auth.signOut"))) throw new Error("Session sign-out failed");
  } finally {
    stopPresence();
    resetCache();
    clearCookies();
  }
}

function weightOf(flow: Flow) {
  if (config.onlyFlows && !config.onlyFlows.includes(flow.name)) return 0;
  const base = config.mode === "backfill" ? flow.backfillWeight : flow.weight;
  return base * persona.flowBias[flow.name];
}

async function runFlow(flow: Flow, world: World) {
  const token = beginFlow(flow.name);
  if (cohorts) {
    recordObservation("organization", cohorts.organization);
    recordObservation("user", cohorts.user);
  }
  trace("flow", flow.name);
  try {
    const outcome = await workflowOutcome(() => flow.run({ world }));
    return endFlow(flow.name, token, outcome);
  } catch (error) {
    endFlow(flow.name, token, error instanceof SessionOver ? "skipped" : "failed");
    throw error;
  }
}

async function runFlowSafely(flow: Flow, world: World) {
  try {
    await runFlow(flow, world);
  } catch (error) {
    if (error instanceof SessionOver) throw error;
    console.error(`[vu ${__VU}] flow ${flow.name} threw: ${String(error)}`);
  }
}

/** When this VU's session must end: its own length, or shortly after the hold phase ends. */
function sessionDeadline() {
  const testEnd =
    exec.scenario.startTime +
    plannedEndMs +
    (config.mode === "measure" ? rng.between(0, 45_000) : 0);
  const length = sessionDuration(persona, rng);
  return { at: Math.min(Date.now() + length, testEnd), testEnd };
}

/**
 * One measure or smoke iteration: a person's working session. Sign in, load the workspace as
 * the web does, open the first conversation, then run persona-weighted flows with pauses until
 * the session ends; sign out and stay offline for a while.
 */
async function runSessionImpl(flows: Flow[]) {
  if (config.mode === "measure" && exec.vu.iterationInScenario === 0) {
    await idle(rng.between(0, 30_000), "start jitter");
    const offline = offlineLength();
    // Start at a random point in the work/offline cycle, not with every quiet user signing in.
    if (rng.chance(offline / (offline + 13 * minute)))
      await idle(
        Math.min(
          rng.between(0, offline),
          Math.max(0, exec.scenario.startTime + plannedEndMs - Date.now()),
        ),
        "not at desk",
      );
  }
  const { at, testEnd } = sessionDeadline();
  if (Date.now() >= testEnd) {
    // The hold phase is over; stay offline. Short idles end within k6's graceful ramp-down.
    await idle(5000, "after test end");
    return;
  }
  const world = await signIn();
  if (!world) {
    await idle(rng.between(5000, 15_000), "sign-in failed");
    return;
  }
  setDeadline(at);
  try {
    if (config.realtime)
      connectRealtime(world.organizationId, world.userId, (event) => {
        if (event.domain === "messaging" && event.conversationId)
          world.activity.set(event.conversationId, Date.now());
      });
    await Promise.all([mountFrame(world), showMessaging(world)]);
    // The dashboard opens the first conversation in the sidebar.
    const landing = joinedConversations(world)[0];
    if (landing) await openConversation(world, landing.id);
    await think("read");
    for (;;) {
      await away();
      const flow = rng.weighted(flows, weightOf);
      if (!flow) break;
      await runFlowSafely(flow, world);
      await think("navigate");
    }
  } catch (error) {
    if (!(error instanceof SessionOver)) throw error;
  } finally {
    setDeadline(Infinity);
    trace("session", "sign out");
    await signOut();
  }
  if (Date.now() < testEnd) await idle(Math.min(offlineLength(), testEnd - Date.now()), "offline");
}

/** Low-concurrency, deterministic preflight. Never share this traffic with measurement. */
async function runCoverageImpl(flows: Flow[]) {
  setDeadline(Infinity);
  const world = await signIn();
  if (!world) throw new Error("Coverage sign-in failed");
  try {
    if (config.realtime)
      connectRealtime(world.organizationId, world.userId, (event) => {
        if (event.domain === "messaging" && event.conversationId)
          world.activity.set(event.conversationId, Date.now());
      });
    await Promise.all([mountFrame(world), showMessaging(world)]);
    const landing = joinedConversations(world)[0];
    if (landing) await openConversation(world, landing.id);
    for (const flow of flows) {
      if (config.onlyFlows && !config.onlyFlows.includes(flow.name)) continue;
      const outcome = await runFlow(flow, world);
      if (outcome !== "completed") throw new Error(`Coverage flow ${flow.name}: ${outcome}`);
    }
  } finally {
    await signOut();
  }
}

let backfillWorld: World | null = null;

/**
 * One backfill iteration: one write-heavy flow without pauses or socket. The VU signs in once
 * and keeps its session across iterations (noCookiesReset).
 */
async function runBackfillStepImpl(flows: Flow[]) {
  if (!backfillWorld) {
    backfillWorld = await signIn();
    if (!backfillWorld) return;
    await showMessaging(backfillWorld);
  }
  const flow = rng.weighted(flows, weightOf);
  if (flow) await runFlowSafely(flow, backfillWorld);
}

async function guardSession(run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    disconnectRealtime();
    stopPresence();
    throw error;
  }
}

export function runSession(flows: Flow[]) {
  return guardSession(() => runSessionImpl(flows));
}

export function runCoverage(flows: Flow[]) {
  return guardSession(() => runCoverageImpl(flows));
}

export function runBackfillStep(flows: Flow[]) {
  return guardSession(() => runBackfillStepImpl(flows));
}
