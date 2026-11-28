import type { AppId } from "../../apps/index.ts";
import type { HarnessSkill } from "../../harness-runtime/local.ts";

/**
 * What an optional app adds to an agent's instructions while the app is enabled. Everything an
 * agent is told about an app comes from its guide, so that the general instructions name no app
 * and a new app needs only a new guide.
 */
export interface AppGuide {
  app: AppId;
  /** The app's name as an owner says it. */
  title: string;
  /**
   * What belongs in the app, with the loose phrases an owner uses for it. Agents choose the app
   * from this when the owner names none, or names the wrong one.
   */
  purpose: string;
  /** Rules that apply to every turn while the app is enabled. */
  rules: readonly string[];
  /** Inputs of the app's most used tools, so that an agent need not guess them. */
  inputs: readonly string[];
  skill: HarnessSkill;
}
