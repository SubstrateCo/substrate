import { mcpTools } from "../tools/index.ts";
import { crmSkill } from "./crm.ts";
import { startupSkills } from "./registry.ts";
import { expect, test } from "bun:test";

test("the built-in CRM workflow ships once and refers only to registered tools", () => {
  expect(startupSkills.filter((skill) => skill.id === "substrate-crm")).toEqual([crmSkill]);
  const references = [...crmSkill.content.matchAll(/`([a-z]+_[a-z_]+)`/g)].map((match) => match[1]);
  expect(references).toContain("transition_crm_deal");
  expect(references).toContain("list_crm_interactions");
  for (const name of references) expect(name! in mcpTools).toBe(true);
});

test("new-deal guidance preserves explicit currency and does not rewrite existing deals", () => {
  expect(crmSkill.content).toContain("An explicit currency override wins.");
  expect(crmSkill.content).toContain("never silently assume USD");
  expect(crmSkill.content).toContain(
    "If the amount is unknown, keep both amount and currency null.",
  );
  expect(crmSkill.content).toContain(
    "Organization defaults do not supply an amount or expected close date.",
  );
  expect(crmSkill.content).toContain(
    "Changing defaults never authorizes converting amounts or updating the currencies of existing deals",
  );
});

test("background CRM guidance requests later interactive instructions without ask", () => {
  const background = crmSkill.content.split("## Approval, publishing and retries")[1]!;
  expect(background).toContain("plain reply");
  expect(background).toContain("without ask");
  expect(background).not.toContain("with reply and ask");
});

test("the CRM workflow separates internal actor activity from customer contact", () => {
  expect(crmSkill.content).toContain("Activity is not customer-contact history");
  expect(crmSkill.content).toContain("Use interactions for observed customer contact.");
  expect(crmSkill.content).toContain("Do not guess or reveal private agent names or IDs");
});

test("message-backed creation requires approved fields and a separate destination-audience decision", () => {
  expect(crmSkill.content).toContain(
    "Linking an existing record and creating one from a message are different actions.",
  );
  expect(crmSkill.content).toContain(
    "Obtain explicit approval of those exact fields and that destination audience before setting consentToRecordAudience.",
  );
  expect(crmSkill.content).toContain("Message access is not consent to copy its contents");
  expect(crmSkill.content).toContain("never use it as an entity ID or substitute a pasted quote");
});
