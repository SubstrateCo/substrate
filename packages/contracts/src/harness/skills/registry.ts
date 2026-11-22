import { appEnabled, type AppId } from "../../apps/index.ts";
import { crmSkill } from "./crm.ts";
import { messagingSkill } from "./messaging.ts";
import { searchSkill } from "./search.ts";
import { tasksSkill } from "./tasks.ts";

/**
 * Domain skills that Substrate owns. They are rewritten on every sync so they match the
 * current MCP tools; local edits do not persist.
 */
export const startupSkills = [searchSkill, messagingSkill, tasksSkill, crmSkill];
export const startupSkillIds = startupSkills.map((skill) => skill.id);

export function enabledStartupSkills(enabledApps: readonly AppId[]) {
  return startupSkills.filter((skill) =>
    skill.id === tasksSkill.id
      ? appEnabled(enabledApps, "tasks")
      : skill.id !== crmSkill.id || appEnabled(enabledApps, "crm"),
  );
}
