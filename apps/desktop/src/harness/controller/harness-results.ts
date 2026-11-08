import { harnessKinds } from "@startup-os/contracts/harness";

import { skillSchema, serverSchema } from "../bridge/harness-bridge.ts";
import { z } from "zod";

export const localResultSchema = z.object({
  organizationId: z.string(),
  agentId: z.string(),
  harness: z.enum(harnessKinds),
  skills: z.array(skillSchema.strip()),
  mcpServers: z.array(
    z.union(
      serverSchema.options.map((schema) =>
        schema.strip().extend({ readOnly: z.boolean().optional() }),
      ),
    ),
  ),
});
export const inspectionSchema = z.array(
  z.object({
    harness: z.enum(harnessKinds),
    available: z.boolean(),
    version: z.string().optional(),
    capabilities: z.object({
      resume: z.boolean(),
      permissions: z.boolean(),
      nativeAgents: z.boolean(),
    }),
  }),
);
