import { ValidationError } from "../../errors";

export type Reference = { kind: "task" | "project" | "person"; id: string };
const token = /@\[(task|project|person):([0-9a-f-]{36})\]/gi;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function messageReferences(body: string): Reference[] {
  const result = new Map<string, Reference>();
  for (const match of body.matchAll(token)) {
    if (!uuid.test(match[2]!)) throw new ValidationError("Invalid reference.");
    const kind = match[1]!.toLowerCase();
    if (kind !== "task" && kind !== "project" && kind !== "person")
      throw new ValidationError("Invalid reference.");
    const id = match[2]!.toLowerCase();
    result.set(`${kind}:${id}`, { kind, id });
  }
  if (body.replace(token, "").includes("@[")) throw new ValidationError("Invalid reference.");
  if (result.size > 25) throw new ValidationError("At most 25 references are allowed.");
  return [...result.values()];
}
