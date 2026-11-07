import { z } from "zod";

export const harnessModelSchema = z.object({
  id: z.string().min(1).max(500),
  name: z.string().min(1).max(500),
  provider: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean().optional(),
});
export const harnessModelCatalogSchema = z.object({
  harness: z.enum(["opencode", "claude", "codex", "antigravity"]),
  status: z.enum(["ready", "unavailable"]),
  models: z.array(harnessModelSchema).max(10000),
});
export type HarnessModel = z.infer<typeof harnessModelSchema>;
export type HarnessModelCatalog = z.infer<typeof harnessModelCatalogSchema>;
