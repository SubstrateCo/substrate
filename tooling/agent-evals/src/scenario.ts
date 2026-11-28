import type { RunRecord } from "./runner.ts";
import type { World } from "./world.ts";

/** What the owner does next. Answer and decision steps are skipped when nothing waits for them. */
export type Step =
  /** A message in the owner's private DM with the agent. */
  | { type: "message"; text: string }
  /** A mention of the agent in a thread of a shared conversation. */
  | { type: "mention"; conversation: string; replyTo: string; text: string }
  /** A tick of a routine that the owner set up: a background turn that posts to the owner's DM. */
  | { type: "routine"; prompt: string }
  /** The owner's answer to the agent's open question. */
  | { type: "answer"; text: string }
  | { type: "approve" }
  | { type: "decline" };

export interface Check {
  name: string;
  pass: boolean;
  /** What was found, for a failed check. */
  detail?: string;
}

export interface Scenario {
  id: string;
  /** The workspace apps the task combines. */
  apps: string[];
  /**
   * Optional apps that are off in this workspace. The world is seeded with every app on, then
   * these are turned off, as when an organization stops using an app that holds records.
   */
  appsOff?: ("tasks" | "crm")[];
  steps: Step[];
  /** Substrate tool calls a careful agent needs. More calls lower the efficiency score. */
  budget: number;
  setup?(world: World): Promise<void>;
  /** Checks against the workspace after the run. The run succeeds when every check passes. */
  check(world: World, record: RunRecord): Promise<Check[]>;
}

type Found = string | number | null | undefined;

/** One check. found says what the workspace held, for the report of a failed check. */
export function check(name: string, pass: boolean, found?: Found | readonly Found[]): Check {
  const result: Check = { name, pass };
  if (!pass && found !== undefined) result.detail = [found].flat().join(", ");
  return result;
}

/** All of the agent's published text in the run, lower case. */
export const said = (record: RunRecord) =>
  [...record.replies, ...record.questions]
    .join("\n")
    .toLowerCase()
    // Models write a typographic apostrophe; the checks match a plain one.
    .replaceAll(String.fromCodePoint(0x2019), "'");

/** Successful calls of the named tools. */
export const calls = (record: RunRecord, ...tools: string[]) =>
  record.turns.flatMap((turn) => turn.calls).filter((call) => call.ok && tools.includes(call.tool));

/** Tools that change the workspace, other than reply. */
export const writes = (record: RunRecord) =>
  record.turns
    .flatMap((turn) => turn.calls)
    .filter(
      (call) =>
        call.ok &&
        /^(create|update|move|delete|archive|restore|share|revoke|add|remove|attach|detach|transition|publish|set|change|assign)_/.test(
          call.tool,
        ),
    );
