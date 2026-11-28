import { z } from "zod";

export const skillRepositorySchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/,
    "Use a public GitHub repository, like vercel-labs/agent-skills.",
  )
  .refine((value) => !value.split("/").some((part) => part === "." || part === ".."));
export const packageSkillNameSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64);
export const skillUpdateFrequencySchema = z.enum(["daily", "weekly", "manual"]);
export type SkillUpdateFrequency = z.infer<typeof skillUpdateFrequencySchema>;
export const skillPackageStateSchema = z.object({
  frequency: skillUpdateFrequencySchema,
  lastAttemptAt: z.number().nullable(),
  lastSuccessAt: z.number().nullable(),
  error: z.string().nullable(),
});
export const installedSkillPackageSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.string(),
});
export const skillPackagesSchema = z.object({
  skills: z.array(installedSkillPackageSchema),
  updates: skillPackageStateSchema,
});
export type SkillPackages = z.infer<typeof skillPackagesSchema>;
export const skillSourcePreviewSchema = z.object({
  source: skillRepositorySchema,
  skills: z.array(
    z.object({
      name: packageSkillNameSchema,
      description: z.string(),
    }),
  ),
});
export type SkillSourcePreview = z.infer<typeof skillSourcePreviewSchema>;
