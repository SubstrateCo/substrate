import { ruleTester } from "../test-support.ts";
import { machineTransitions } from "./machine-transitions.ts";

const allStatusWrites = [{ allStatusWrites: true }];

ruleTester.run("machine-transitions", machineTransitions, {
  valid: [
    'db.update(turns).set({ status: turnMachine.events.run.to, startedAt: now }).where(and(eq(turns.id, id), inStates(turns.status, turnMachine.from("run"))));',
    "const status = turnMachine.events[event].to;\ndb.update(turns).set({ status }).where(inStates(turns.status, turnMachine.from(event)));",
    'db.update(requests).set({ status: requestMachine.events.decline.to }).where(and(eq(requests.id, id), answerableBy("decline")));',
    "db.update(requests).set({ status: requestMachine.events.answer.to }).where(inStates(requests.status, requestMachine.events.answer.from));",
    "db.update(tasks).set({ status: input.status }).where(eq(tasks.id, id));",
    { code: 'db.insert(turns).values({ status: "assigned" });', options: allStatusWrites },
  ],
  invalid: [
    {
      code: 'db.update(turns).set({ status: turnMachine.events.run.to }).where(inStates(turns.status, turnMachine.from("wait")));',
      errors: [
        { messageId: "noFrom", data: { machine: "turnMachine", from: 'turnMachine.from("run")' } },
      ],
    },
    {
      code: 'db.update(turns).set({ status: turnMachine.events.run.to }).where(inStates(turns.status, sessionMachine.from("run")));',
      errors: [
        { messageId: "noFrom", data: { machine: "turnMachine", from: 'turnMachine.from("run")' } },
      ],
    },
    {
      code: "db.update(invocations).set({ status: invocationMachine.events[event].to }).where(decidable(other));",
      errors: [
        {
          messageId: "noFrom",
          data: { machine: "invocationMachine", from: "invocationMachine.from(event)" },
        },
      ],
    },
    {
      code: "db.update(turns).set({ status: turnMachine.events.run.to });",
      errors: [
        { messageId: "noWhere", data: { machine: "turnMachine", from: 'turnMachine.from("run")' } },
      ],
    },
    {
      code: 'db.update(turns).set({ status: "running" }).where(eq(turns.id, id));',
      options: allStatusWrites,
      errors: [{ messageId: "notEvent" }],
    },
    {
      code: "let status = turnMachine.events.run.to;\ndb.update(turns).set({ status }).where(eq(turns.id, id));",
      options: allStatusWrites,
      errors: [{ messageId: "notEvent" }],
    },
  ],
});
