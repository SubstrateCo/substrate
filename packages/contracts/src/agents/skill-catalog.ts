import {
  skillRepositorySchema,
  packageSkillNameSchema,
} from "../harness-runtime/skill-packages.ts";
import { z } from "zod";

export const searchSkillsInput = z.strictObject({
  query: z.string().trim().min(2).max(120),
});
export const catalogSkillSchema = z.object({
  name: packageSkillNameSchema,
  source: skillRepositorySchema,
  installs: z.number().int().nonnegative(),
});
export type CatalogSkill = z.infer<typeof catalogSkillSchema>;
export type SkillSearch = { skills: CatalogSkill[] };
