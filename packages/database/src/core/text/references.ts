import { ValidationError } from "../../errors";

export type Reference = {
  kind: "task" | "project" | "person" | "agent" | "channel" | "thread";
  id: string;
};
const token = /@\[(task|project|person|agent|channel|thread):([0-9a-f-]{36})\]/gi;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidReference(text: string) {
  const found = /@\[[^\]\s]{0,60}\]?/.exec(text)?.[0] ?? "@[";
  return new ValidationError(
    `Invalid reference ${found}. A message can mention only a task, project, person, agent, channel or thread, written as @[kind:id] with the record's ID. Write anything else, such as a CRM account, contact or deal, as plain text.`,
  );
}

export function messageReferences(body: string): Reference[] {
  const result = new Map<string, Reference>();
  for (const match of body.matchAll(token)) {
    if (!uuidPattern.test(match[2]!)) throw invalidReference(match[0]);
    // SAFETY: The token pattern only captures these kinds, matched case-insensitively.
    const kind = match[1]!.toLowerCase() as Reference["kind"];
    const id = match[2]!.toLowerCase();
    result.set(`${kind}:${id}`, { kind, id });
  }
  const rest = body.replace(token, "");
  if (rest.includes("@[")) throw invalidReference(rest.slice(rest.indexOf("@[")));
  if (result.size > 25) throw new ValidationError("At most 25 references are allowed.");
  return [...result.values()];
}
