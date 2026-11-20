import { harnessKinds } from "./kinds.ts";
import { z } from "zod";

const harnessModelSchema = z.object({
  id: z.string().min(1).max(500),
  name: z.string().min(1).max(500),
  provider: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean().optional(),
});
/**
 * A sign-in method that the agent advertises. agent: the agent signs in by itself, often in the
 * system browser. terminal: Substrate runs the agent's own login command and shows its output.
 * Launch arguments and environment stay in the harness worker.
 */
export const harnessAuthMethodSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(["agent", "terminal"]),
});
export const harnessModelCatalogSchema = z.object({
  harness: z.enum(harnessKinds),
  /** sign-in: the agent is installed but answered auth_required; models stay empty. */
  status: z.enum(["ready", "unavailable", "sign-in"]),
  models: z.array(harnessModelSchema).max(10000),
  /** What the agent offers for its own credentials. Absent when the agent did not start. */
  auth: z
    .object({
      methods: z.array(harnessAuthMethodSchema).max(20),
      /** The agent advertised logout. */
      signOut: z.boolean(),
    })
    .optional(),
});
export type HarnessModel = z.infer<typeof harnessModelSchema>;
export type HarnessAuthMethod = z.infer<typeof harnessAuthMethodSchema>;
export type HarnessModelCatalog = z.infer<typeof harnessModelCatalogSchema>;

/** Status of one sign-in. running until the agent or its login command finishes. */
export const harnessSignInStatuses = ["running", "succeeded", "failed", "cancelled"] as const;
export type HarnessSignInStatus = (typeof harnessSignInStatuses)[number];
/**
 * Output of a sign-in since cursor. output has no ANSI escapes. cursor is the position to read
 * from next; text before the retained window is dropped.
 */
export const harnessSignInStateSchema = z.object({
  loginId: z.string(),
  harness: z.enum(harnessKinds),
  type: z.enum(["agent", "terminal"]),
  status: z.enum(harnessSignInStatuses),
  output: z.string().max(200_000),
  cursor: z.number().int().min(0),
});
export type HarnessSignInState = z.infer<typeof harnessSignInStateSchema>;
