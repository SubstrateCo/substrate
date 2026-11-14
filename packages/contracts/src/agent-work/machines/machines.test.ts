import type { Machine, MachineEvent } from "../../state-machine.ts";
import { agentInvocationStatuses } from "../invocations.ts";
import { agentRequestStatuses } from "../requests.ts";
import { agentSessionStatuses, helperStatuses, inboxStatuses, turnStatuses } from "../turns.ts";
import { helperMachine } from "./helper.ts";
import { inboxItemMachine } from "./inbox-item.ts";
import { invocationMachine } from "./invocation.ts";
import { requestMachine } from "./request.ts";
import { sessionMachine } from "./session.ts";
import { turnMachine } from "./turn.ts";
import { agentWakeStates, wakeMachine } from "./wake.ts";
import { expect, test } from "bun:test";

function describeMachine<
  S extends string,
  T extends S,
  E extends Record<keyof E, MachineEvent<Exclude<S, T>, S>>,
>(
  name: string,
  machine: Machine<S, T, E>,
  statuses: readonly string[],
  table: (readonly [S, keyof E, S])[],
) {
  const events = Object.keys(machine.events) as (keyof E)[];

  test(`the ${name} machine has the stored statuses as its states`, () => {
    const states: readonly string[] = machine.states;
    expect(states).toEqual(statuses);
  });

  test(`the ${name} machine performs exactly the transitions the stores perform`, () => {
    const expected = new Map(table.map(([from, event, to]) => [`${from}:${String(event)}`, to]));
    expect(events).toEqual(expect.arrayContaining(table.map((row) => row[1])));
    for (const state of machine.states)
      for (const event of events)
        expect([state, event, machine.next(state, event)]).toEqual([
          state,
          event,
          expected.get(`${state}:${String(event)}`) ?? null,
        ]);
  });

  test(`the ${name} machine's terminal states accept no event`, () => {
    for (const state of machine.terminal)
      for (const event of events) expect(machine.next(state, event)).toBeNull();
  });
}

const live = ["assigned", "running", "waiting", "stopping"] as const;
const fromEach = <S extends string, Ev extends string>(states: readonly S[], event: Ev, to: S) =>
  states.map((state) => [state, event, to] as const);

describeMachine("request", requestMachine, agentRequestStatuses, [
  ["pending", "answer", "resolved"],
  ["pending", "decline", "resolved"],
  ["pending", "approve", "executing"],
  ["executing", "execute", "executed"],
  ["executing", "fail", "failed"],
  ["resolved", "deliver", "delivered"],
  ["pending", "cancel", "cancelled"],
  ["pending", "expire", "expired"],
  ["pending", "orphan", "orphaned"],
  ["resolved", "undeliver", "undelivered"],
]);

describeMachine("wake", wakeMachine, agentWakeStates, [["pending", "ack", "acked"]]);

describeMachine("inbox item", inboxItemMachine, inboxStatuses, [
  ...fromEach(["pending", "confirmed_unconsumed"], "submit", "submitted"),
  ...fromEach(["submitted", "uncertain"], "consume", "consumed"),
  ["submitted", "requeue", "confirmed_unconsumed"],
  ["submitted", "unconfirm", "uncertain"],
  ...fromEach(["submitted", "uncertain"], "interrupt", "uncertain"),
  ["submitted", "unclaim", "pending"],
  ...fromEach(["submitted", "uncertain"], "revertSteer", "pending"),
  ["uncertain", "resend", "pending"],
  ...fromEach(["pending", "confirmed_unconsumed", "submitted", "consumed"], "drop", "dropped"),
  ...fromEach(["submitted", "uncertain"], "dismiss", "dropped"),
  ["uncertain", "discard", "dropped"],
  ["pending", "supersede", "superseded"],
]);

describeMachine("turn", turnMachine, turnStatuses, [
  ...fromEach(["assigned", "waiting"], "run", "running"),
  ["running", "wait", "waiting"],
  ...fromEach(live, "stop", "stopping"),
  ...fromEach(live, "complete", "completed"),
  ...fromEach(live, "cancel", "cancelled"),
  ...fromEach(live, "interrupt", "interrupted"),
  ...fromEach(live, "fail", "failed"),
  ...fromEach(live, "needAttention", "needs_attention"),
  ...fromEach(["assigned", "running", "waiting"], "continue", "assigned"),
  ["needs_attention", "retry", "assigned"],
  ["needs_attention", "dismiss", "cancelled"],
  ["needs_attention", "settleCompleted", "completed"],
  ["needs_attention", "settleCancelled", "cancelled"],
  ["needs_attention", "settleInterrupted", "interrupted"],
]);

describeMachine("session", sessionMachine, agentSessionStatuses, [
  ...fromEach(["idle", "working"], "work", "working"),
  ...fromEach(["idle", "working"], "rest", "idle"),
]);

describeMachine("invocation", invocationMachine, agentInvocationStatuses, [
  ["received", "admit", "admitted"],
  ["received", "hold", "pending_approval"],
  ["received", "limit", "rate_limited"],
  ["pending_approval", "approve", "admitted"],
  ["pending_approval", "decline", "declined"],
  ["pending_approval", "expire", "expired"],
  ["pending_approval", "cancel", "cancelled"],
  ["admitted", "drop", "dropped"],
]);

describeMachine("helper", helperMachine, helperStatuses, [
  ["running", "finish", "finished"],
  ["running", "fail", "failed"],
  ["running", "stop", "stopped"],
]);
