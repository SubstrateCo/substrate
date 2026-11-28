import type { HarnessSkill } from "@substrate/contracts/harness-runtime";

const skillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function toSkillName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

export function openingName(skill?: HarnessSkill) {
  if (!skill) return "";
  if (skillName.test(skill.name)) return skill.name;
  return skillName.test(skill.id) ? skill.id : toSkillName(skill.name);
}
