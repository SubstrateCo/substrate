import type { Flow } from "../flows/flow.ts";
import { mount, resetCache, settleCache } from "./client-cache.ts";
import { config, plannedEndMs } from "./config.ts";
import { password, userOf } from "./data.ts";
import { trace } from "./debug.ts";
import { call, clearCookies, setOrganization } from "./http.ts";
import { keys } from "./keys.ts";
import { flowDuration, flowRuns } from "./metrics.ts";
import { away, idle, SessionOver, setDeadline, think } from "./pacing.ts";
import { persona, rng } from "./persona.ts";
import { connectRealtime, disconnectRealtime } from "./realtime.ts";
import { mountFrame } from "./screens/frame.ts";
import { openConversation, showMessaging } from "./screens/messaging.ts";
import { createWorld, joinedConversations, type World } from "./world.ts";
import exec from "k6/execution";

const minute = 60_000;

/** Signs in and opens the remembered workspace, switching to the user's own if it differs. */
async function signIn(): Promise<World | null> {
  const user = userOf(exec.vu.idInTest);
  resetCache();
  clearCookies();
  trace(
    "session",
    `sign in ${user.email} (${persona.role}, activity ${persona.activity.toFixed(2)})`,
  );
  if (!(await call("auth.signIn", { email: user.email, password }))) return null;
  setOrganization(user.organizationId);
  // The root route loads the session once; the frame then keeps it (staleTime Infinity).
  const session = await mount(
    keys.session,
    () => call<{ session: { activeOrganizationId: string | null } }>("session"),
    { staleTime: Infinity, frame: true },
  );
  if (!session) return null;
  if (session.session.activeOrganizationId !== user.organizationId)
    await call("auth.setActive", { organizationId: user.organizationId });
  return createWorld(user);
}

async function signOut() {
  disconnectRealtime();
  await settleCache();
  await call("auth.signOut");
  resetCache();
  clearCookies();
}

function weightOf(flow: Flow) {
  if (config.onlyFlows && !config.onlyFlows.includes(flow.name)) return 0;
  const base = config.mode === "backfill" ? flow.backfillWeight : flow.weight;
  return base * persona.flowBias[flow.name];
}

async function runFlow(flow: Flow, world: World) {
  const started = Date.now();
  trace("flow", flow.name);
  try {
    await flow.run({ world });
  } finally {
    flowRuns.add(1, { flow: flow.name });
    flowDuration.add(Date.now() - started, { flow: flow.name });
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
  const length =
    rng.logNormal(13 * minute, 0.3, 8 * minute, 20 * minute) * Math.pow(persona.activity, 0.2);
  return { at: Math.min(Date.now() + length, testEnd), testEnd };
}

/**
 * One measure or smoke iteration: a person's working session. Sign in, load the workspace as
 * the web does, open the first conversation, then run persona-weighted flows with pauses until
 * the session ends; sign out and stay offline for a while.
 */
export async function runSession(flows: Flow[]) {
  if (config.mode === "measure" && exec.vu.iterationInScenario === 0)
    await idle(rng.between(0, 30_000), "start jitter");
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
  if (Date.now() < testEnd)
    await idle(
      Math.min(rng.logNormal(3 * minute, 0.5, minute, 10 * minute), testEnd - Date.now()),
      "offline",
    );
}

let backfillWorld: World | null = null;

/**
 * One backfill iteration: one write-heavy flow without pauses or socket. The VU signs in once
 * and keeps its session across iterations (noCookiesReset).
 */
export async function runBackfillStep(flows: Flow[]) {
  if (!backfillWorld) {
    backfillWorld = await signIn();
    if (!backfillWorld) return;
    await showMessaging(backfillWorld);
  }
  const flow = rng.weighted(flows, weightOf);
  if (flow) await runFlowSafely(flow, backfillWorld);
}
