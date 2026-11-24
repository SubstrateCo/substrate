import { appEnabled, type AppId } from "../../apps/index.ts";
import { crmSkill } from "./crm.ts";
import { inboxSkill } from "./inbox.ts";
import { meetingsSkill } from "./meetings.ts";
import { messagingSkill } from "./messaging.ts";
import { searchSkill } from "./search.ts";
import { tasksSkill } from "./tasks.ts";

/**
 * Domain skills that Substrate owns. They are rewritten on every sync so they match the
 * current MCP tools; local edits do not persist.
 */
export const startupSkills = [
  searchSkill,
  messagingSkill,
  tasksSkill,
  crmSkill,
  inboxSkill,
  meetingsSkill,
];
export const startupSkillIds = startupSkills.map((skill) => skill.id);

export function enabledStartupSkills(enabledApps: readonly AppId[]) {
  const apps = new Map<string, AppId>([
    [tasksSkill.id, "tasks"],
    [crmSkill.id, "crm"],
    [inboxSkill.id, "inbox"],
    [meetingsSkill.id, "meetings"],
  ]);
  return startupSkills.filter((skill) => {
    const app = apps.get(skill.id);
    return !app || appEnabled(enabledApps, app);
  });
}
