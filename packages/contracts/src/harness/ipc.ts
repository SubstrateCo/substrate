import { bridgeOutput, type BridgeAPI } from "../desktop/ipc.ts";
import { harnessKinds } from "../harness-runtime/kinds.ts";
import { harnessIdSchema } from "../harness-runtime/local.ts";
import { harnessMcpServerSchema, harnessSkillSchema } from "../harness-runtime/local.ts";
import type { HarnessInspection, HarnessLocalConfiguration } from "../harness-runtime/local.ts";
import type { HarnessModelCatalog, HarnessSignInState } from "../harness-runtime/models.ts";
import { z } from "zod";

export const channel = "substrate:harness";
const id = harnessIdSchema;
const harness = z.enum(harnessKinds);
export const rendererLocalSchemas = {
  listModels: z.strictObject({ harness, agentId: id.optional() }),
  scanConfiguration: z.strictObject({ harness, agentId: id }),
  saveSkill: harnessSkillSchema.extend({ harness, agentId: id, id: id.optional() }),
  deleteSkill: z.strictObject({ harness, agentId: id, id }),
  resetDefaults: z.strictObject({ harness, agentId: id }),
  saveMcpServer: z.union(
    harnessMcpServerSchema.options.map((schema) =>
      schema.extend({ agentId: id, id: id.optional() }),
    ),
  ),
  deleteMcpServer: z.strictObject({ agentId: id, id }),
  /** Main asks the owner for a folder in a native dialog. The renderer never sends a path. */
  chooseWorkspace: z.strictObject({ agentId: id }),
  clearWorkspace: z.strictObject({ agentId: id }),
};
const loginId = z.uuid();
/**
 * Sign-in to a native agent. Credentials stay in the agent's own store; Substrate only starts the
 * agent's advertised method and relays a terminal login's output and input lines.
 */
export const rendererSignInSchemas = {
  signIn: z.strictObject({ harness, methodId: z.string().min(1).max(200) }),
  readSignIn: z.strictObject({
    loginId,
    cursor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  }),
  sendSignInInput: z.strictObject({
    loginId,
    text: z
      .string()
      .max(4096)
      .refine((value) => !/[\r\n\0]/.test(value)),
  }),
  cancelSignIn: z.strictObject({ loginId }),
  signOut: z.strictObject({ harness }),
};
export const methods = {
  status: {
    input: z.undefined(),
    output: bridgeOutput<{
      connected: boolean;
      organizationId?: string;
      harnesses?: HarnessInspection[];
    }>(),
  },
  synchronize: {
    input: z.undefined(),
    output: z.object({ connected: z.literal(true), organizationId: z.string() }),
  },
  disconnect: { input: z.undefined() },
  listModels: {
    input: rendererLocalSchemas.listModels,
    output: bridgeOutput<HarnessModelCatalog>(),
  },
  scanConfiguration: {
    input: rendererLocalSchemas.scanConfiguration,
    output: bridgeOutput<HarnessLocalConfiguration>(),
  },
  saveSkill: { input: rendererLocalSchemas.saveSkill },
  deleteSkill: { input: rendererLocalSchemas.deleteSkill },
  resetDefaults: { input: rendererLocalSchemas.resetDefaults },
  saveMcpServer: { input: rendererLocalSchemas.saveMcpServer },
  deleteMcpServer: { input: rendererLocalSchemas.deleteMcpServer },
  chooseWorkspace: { input: rendererLocalSchemas.chooseWorkspace },
  clearWorkspace: { input: rendererLocalSchemas.clearWorkspace },
  signIn: { input: rendererSignInSchemas.signIn, output: bridgeOutput<HarnessSignInState>() },
  readSignIn: {
    input: rendererSignInSchemas.readSignIn,
    output: bridgeOutput<HarnessSignInState>(),
  },
  sendSignInInput: { input: rendererSignInSchemas.sendSignInInput },
  cancelSignIn: { input: rendererSignInSchemas.cancelSignIn },
  signOut: { input: rendererSignInSchemas.signOut },
};
export type HarnessAPI = BridgeAPI<typeof methods>;
export type LocalHarnessMethod = keyof typeof rendererLocalSchemas;
// SAFETY: schema keys are the nonempty allowlist of renderer-local operations.
export const localHarnessMethods = Object.keys(rendererLocalSchemas) as [
  LocalHarnessMethod,
  ...LocalHarnessMethod[],
];
export type SignInHarnessMethod = keyof typeof rendererSignInSchemas;
// SAFETY: schema keys are the nonempty allowlist of renderer sign-in operations.
export const signInHarnessMethods = Object.keys(rendererSignInSchemas) as [
  SignInHarnessMethod,
  ...SignInHarnessMethod[],
];
// SAFETY: the array holds exactly these literals; a tuple type allows only one rest element.
export const harnessMethods = [
  "status",
  "synchronize",
  ...localHarnessMethods,
  ...signInHarnessMethods,
] as ["status", "synchronize", ...(LocalHarnessMethod | SignInHarnessMethod)[]];
export type HarnessMethod = (typeof harnessMethods)[number];
