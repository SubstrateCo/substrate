import type { HarnessSkill } from "@substrate/contracts/harness-runtime";

const skillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Release notes" becomes "release-notes", so people can type words and get a valid name. */
export function toSkillName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

/** The name an existing skill opens with: always one the editor accepts. */
export function openingName(skill?: HarnessSkill) {
  if (!skill) return "";
  if (skillName.test(skill.name)) return skill.name;
  return skillName.test(skill.id) ? skill.id : toSkillName(skill.name);
}
