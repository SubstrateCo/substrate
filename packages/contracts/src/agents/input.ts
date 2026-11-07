import { z } from "zod";

const id = z.uuid();
const name = z.string().trim().min(1).max(200);
export const saveAgentInput = z.strictObject({
  id: id.optional(),
  name,
  instructions: z.string().max(100000),
  harness: z.enum(["opencode", "antigravity", "claude", "codex"]),
  model: z.string().trim().min(1).max(500).optional(),
  enabled: z.boolean(),
  useStartupDefaults: z.boolean().default(true),
});
export const deleteAgentInput = z.strictObject({ id });
export const setAgentPictureInput = z.strictObject({ id, fileId: id.nullable() });
export const saveSkillInput = z.strictObject({
  id: id.optional(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens."),
  description: z.string().max(2000),
  content: z.string().max(100000),
});
export const deleteSkillInput = z.strictObject({ id });

const credentialName =
  /(?:secret|password|passwd|token|api[_-]?key|authorization|credential|private[_-]?key|cookie)/i;
const credentialValue =
  /(?:Bearer\s+|-----BEGIN .*PRIVATE KEY|\b(?:sk-|ghp_|github_pat_|AKIA)[A-Za-z0-9_-]{8,})/i;
const nonSecret = z
  .string()
  .max(10000)
  .refine((value) => !credentialValue.test(value), "Authentication secrets are not supported.");
const environment = z
  .record(
    z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
      .refine(
        (key) => !credentialName.test(key),
        "Secret environment variables are not supported.",
      ),
    nonSecret,
  )
  .default({});
const args = z
  .array(
    nonSecret.refine(
      (value) => !credentialName.test(value),
      "Credential arguments are not supported.",
    ),
  )
  .max(200)
  .default([]);
const url = z
  .url()
  .max(4000)
  .refine((value) => {
    const parsed = new URL(value);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash &&
      !credentialValue.test(value) &&
      [...parsed.searchParams.keys()].every((key) => !credentialName.test(key))
    );
  }, "Use an HTTP URL without credentials.");
export const saveMcpServerInput = z.discriminatedUnion("transport", [
  z.strictObject({
    id: id.optional(),
    name,
    transport: z.literal("stdio"),
    command: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .refine((value) => !/[\r\n]/.test(value) && !credentialValue.test(value)),
    args,
    environment,
  }),
  z.strictObject({
    id: id.optional(),
    name,
    transport: z.literal("http"),
    url,
    args: z.array(z.never()).default([]),
    environment: z.record(z.string(), z.never()).default({}),
  }),
]);
export const deleteMcpServerInput = z.strictObject({ id });
export type SaveAgentInput = z.input<typeof saveAgentInput>;
export type SaveSkillInput = z.input<typeof saveSkillInput>;
export type SaveMcpServerInput = z.input<typeof saveMcpServerInput>;
export type SetAgentPictureInput = z.input<typeof setAgentPictureInput>;
export type AgentConfiguration = Omit<z.output<typeof saveAgentInput>, "id"> & {
  id: string;
  image: string | null;
};
export type AgentSkill = Omit<z.output<typeof saveSkillInput>, "id"> & { id: string };
export type AgentMcpServer =
  | (Omit<Extract<z.output<typeof saveMcpServerInput>, { transport: "stdio" }>, "id"> & {
      id: string;
    })
  | (Omit<Extract<z.output<typeof saveMcpServerInput>, { transport: "http" }>, "id"> & {
      id: string;
    });
export interface AgentCatalog {
  agents: AgentConfiguration[];
}
