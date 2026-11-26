import { crmToolbarActions } from "./crm-toolbar";
import { expect, test } from "bun:test";

test("members do not see export or stage editing, which the server allows only for admins", () => {
  for (const section of ["contacts", "accounts", "deals"] as const)
    expect(crmToolbarActions({ section, crm: true, admin: false }).export).toBe(false);
  expect(crmToolbarActions({ section: "pipeline", crm: true, admin: false }).editStages).toBe(
    false,
  );
});

test("admins see export on record lists and stage editing on the pipeline", () => {
  for (const section of ["contacts", "accounts", "deals"] as const)
    expect(crmToolbarActions({ section, crm: true, admin: true }).export).toBe(true);
  expect(crmToolbarActions({ section: "pipeline", crm: true, admin: true })).toMatchObject({
    export: false,
    editStages: true,
  });
});

test("admins can export contacts without the CRM app", () => {
  expect(crmToolbarActions({ section: "contacts", crm: false, admin: true }).export).toBe(true);
});

test("members keep the read-only CRM settings view", () => {
  expect(crmToolbarActions({ section: "accounts", crm: true, admin: false }).settings).toBe(true);
  expect(crmToolbarActions({ section: "contacts", crm: false, admin: true }).settings).toBe(false);
});
