import { harnessKinds } from "@startup-os/contracts/harness";

/* oxlint-disable deslop/no-unknown-parameters -- These functions parse untrusted IPC payloads at the main-process boundary. */
import { z } from "zod";

export const harnessChannel = "startup-os:harness";
export const harnessEventChannel = "startup-os:harness-event";
export const localHarnessMethods = [
  "listModels",
  "scanConfiguration",
  "scanSkills",
  "saveSkill",
  "deleteSkill",
  "saveMcpServer",
  "deleteMcpServer",
] as const;
export type LocalHarnessMethod = (typeof localHarnessMethods)[number];
export type HarnessMethod = "status" | "synchronize" | "execute" | LocalHarnessMethod;
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
const name = z.string().trim().min(1).max(200);
const scope = { organizationId: id, harness: z.enum(harnessKinds) };
export const skillSchema = z.strictObject({
  id,
  name,
  description: z.string().max(2000),
  content: z.string().max(100000),
});
const secret =
  /token|secret|password|credential|api.?key|authorization|cookie|private.?key|bearer\s|-----BEGIN|\b(?:sk-|ghp_|github_pat_|AKIA)[A-Za-z0-9_-]{8,}/i;
const nonSecret = z
  .string()
  .max(10000)
  .refine((value) => !/[\r\n\0]/.test(value) && !secret.test(value));
const args = z.array(nonSecret).max(200).optional();
const environment = z
  .record(
    z
      .string()
      .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      .refine((key) => !secret.test(key)),
    nonSecret,
  )
  .optional();
export const serverSchema = z.discriminatedUnion("transport", [
  z.strictObject({
    id,
    name,
    transport: z.literal("stdio"),
    command: nonSecret.pipe(z.string().min(1).max(2000)),
    args,
    environment,
  }),
  z.strictObject({
    id,
    name,
    transport: z.literal("http"),
    url: z
      .url()
      .max(4000)
      .refine((value) => {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      }),
    args: z.array(z.never()).optional(),
    environment: z.record(z.string(), z.never()).optional(),
  }),
]);
const localSchemas = {
  listModels: z.strictObject(scope),
  scanConfiguration: z.strictObject(scope),
  scanSkills: z.strictObject(scope),
  saveSkill: z.strictObject({ ...scope, skill: skillSchema }),
  deleteSkill: z.strictObject({ ...scope, id }),
  saveMcpServer: z.strictObject({ ...scope, server: serverSchema }),
  deleteMcpServer: z.strictObject({ ...scope, id }),
};
export function parseLocalConfiguration(method: LocalHarnessMethod, value: unknown) {
  return localSchemas[method].parse(value);
}
export const rendererLocalSchemas = {
  listModels: z.strictObject({ harness: scope.harness }),
  scanConfiguration: z.strictObject({ harness: scope.harness }),
  scanSkills: z.strictObject({ harness: scope.harness }),
  saveSkill: skillSchema.extend({ harness: scope.harness, id: id.optional() }),
  deleteSkill: z.strictObject({ harness: scope.harness, id }),
  saveMcpServer: z.union(
    serverSchema.options.map((schema) =>
      schema.extend({ harness: scope.harness, id: id.optional() }),
    ),
  ),
  deleteMcpServer: z.strictObject({ harness: scope.harness, id }),
};
const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start"), organizationId: id, agentId: id }),
  z.strictObject({ type: z.literal("resume"), organizationId: id, sessionId: id }),
  z.strictObject({
    type: z.literal("prompt"),
    organizationId: id,
    sessionId: id,
    text: z.string().min(1).max(100000),
  }),
  z.strictObject({ type: z.literal("interrupt"), organizationId: id, sessionId: id }),
  z.strictObject({
    type: z.literal("respond"),
    organizationId: id,
    sessionId: id,
    requestId: id,
    response: z.json().refine((value) => JSON.stringify(value).length <= 100000),
  }),
  z.strictObject({ type: z.literal("disconnect"), organizationId: id, sessionId: id }),
]);
export function parseHarnessCommand(value: unknown) {
  return commandSchema.parse(value);
}

const senderURL = z.object({ url: z.url() });
export function trustedHarnessSender(
  event: { sender: unknown; senderFrame: unknown },
  contents: { mainFrame: unknown } | undefined,
  rendererURL: string,
): boolean {
  if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame)
    return false;
  const frame = senderURL.safeParse(event.senderFrame);
  return frame.success && new URL(frame.data.url).origin === new URL(rendererURL).origin;
}
