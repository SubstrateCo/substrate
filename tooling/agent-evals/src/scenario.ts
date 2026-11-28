import type { RunRecord } from "./runner.ts";
import type { World } from "./world.ts";

export type Step =
  | { type: "message"; text: string }
  | { type: "mention"; conversation: string; replyTo: string; text: string }
  | { type: "routine"; prompt: string }
  | { type: "answer"; text: string }
  | { type: "approve" }
  | { type: "decline" };

export interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface Scenario {
  id: string;
  apps: string[];
  appsOff?: ("tasks" | "crm")[];
  steps: Step[];
  budget: number;
  setup?(world: World): Promise<void>;
  check(world: World, record: RunRecord): Promise<Check[]>;
}

type Found = string | number | null | undefined;

export function check(name: string, pass: boolean, found?: Found | readonly Found[]): Check {
  const result: Check = { name, pass };
  if (!pass && found !== undefined) result.detail = [found].flat().join(", ");
  return result;
}

const typographicApostrophe = String.fromCodePoint(0x2019);

export const said = (record: RunRecord) =>
  [...record.replies, ...record.questions]
    .join("\n")
    .toLowerCase()
    .replaceAll(typographicApostrophe, "'");

export const calls = (record: RunRecord, ...tools: string[]) =>
  record.turns.flatMap((turn) => turn.calls).filter((call) => call.ok && tools.includes(call.tool));

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
