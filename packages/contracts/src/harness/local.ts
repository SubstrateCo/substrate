import { harnessKinds } from "./kinds.ts";
import { z } from "zod";

export const harnessIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
const name = z.string().trim().min(1).max(200);
export const harnessSkillSchema = z.strictObject({
  id: harnessIdSchema,
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
/** Configuration only. Credentials remain in each native harness's credential store. */
export const harnessMcpServerSchema = z.discriminatedUnion("transport", [
  z.strictObject({
    id: harnessIdSchema,
    name,
    transport: z.literal("stdio"),
    command: nonSecret.pipe(z.string().min(1).max(2000)),
    args,
    environment,
  }),
  z.strictObject({
    id: harnessIdSchema,
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
// Native credential-bearing entries are read-only; they must be edited in the native harness.
const scannedMcpServerSchema = z.union(
  harnessMcpServerSchema.options.map((schema) =>
    schema.strip().extend({ readOnly: z.boolean().optional() }),
  ),
);
export const harnessLocalConfigurationSchema = z.object({
  organizationId: z.string(),
  agentId: z.string(),
  harness: z.enum(harnessKinds),
  skills: z.array(harnessSkillSchema.strip()),
  mcpServers: z.array(scannedMcpServerSchema),
});
export const harnessInspectionSchema = z.object({
  harness: z.enum(harnessKinds),
  available: z.boolean(),
  version: z.string().optional(),
  capabilities: z.object({
    resume: z.boolean(),
    permissions: z.boolean(),
    nativeAgents: z.boolean(),
  }),
});
export type HarnessSkill = z.infer<typeof harnessSkillSchema>;
export type HarnessMcpServer = z.infer<typeof scannedMcpServerSchema>;
export type HarnessLocalConfiguration = z.infer<typeof harnessLocalConfigurationSchema>;
export type HarnessInspection = z.infer<typeof harnessInspectionSchema>;
