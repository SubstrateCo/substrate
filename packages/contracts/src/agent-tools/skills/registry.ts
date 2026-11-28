import { appEnabled, type AppId } from "../../apps/index.ts";
import { crmGuide } from "./crm.ts";
import type { AppGuide } from "./guide.ts";
import { inboxGuide } from "./inbox.ts";
import { messagingSkill } from "./messaging.ts";
import { searchSkill } from "./search.ts";
import { tasksGuide } from "./tasks.ts";

/**
 * One guide for each optional app that agents can use. A new app adds its guide here; nothing
 * else in the agent's general instructions names an app.
 */
export const appGuides: readonly AppGuide[] = [tasksGuide, crmGuide, inboxGuide];

/** The guides of the apps that are enabled, in a fixed order. */
export function enabledAppGuides(enabledApps: readonly AppId[]) {
  return appGuides.filter((guide) => appEnabled(enabledApps, guide.app));
}

const coreSkills = [searchSkill, messagingSkill];

/**
 * Domain skills that Substrate owns. They are rewritten on every sync so they match the
 * current MCP tools; local edits do not persist.
 */
export const startupSkills = [...coreSkills, ...appGuides.map((guide) => guide.skill)];
export const startupSkillIds = startupSkills.map((skill) => skill.id);

export function enabledStartupSkills(enabledApps: readonly AppId[]) {
  return [...coreSkills, ...enabledAppGuides(enabledApps).map((guide) => guide.skill)];
}
