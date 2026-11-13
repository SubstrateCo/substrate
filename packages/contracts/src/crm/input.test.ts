import { crmList, crmWrite } from "./input";
import { describe, expect, test } from "bun:test";

const organizationId = "crm-contract-test";
const entityId = "48c67a2e-211c-4c54-841e-0bfa3bc2b899";
const stageId = "e61f759b-a6f2-4ef2-b116-cc1be16467fb";
const deal = {
  organizationId,
  action: "createDeal",
  title: "Workspace rollout",
  accountEntityId: entityId,
  stageId,
};

describe("CRM request validation", () => {
  test("preserves unknown amounts separately from a zero-valued deal", () => {
    const unknown = crmWrite.parse(deal);
    const zero = crmWrite.parse({ ...deal, amount: "0.00", currency: "USD" });
    expect(unknown).toMatchObject({ amount: null, currency: null });
    expect(zero).toMatchObject({ amount: "0.00", currency: "USD" });
  });

  test.each(["-1", "1e6", "NaN", "1,000", "1.00001"])(
    "rejects unsupported monetary representation %s",
    (amount) => {
      expect(crmWrite.safeParse({ ...deal, amount, currency: "USD" }).success).toBe(false);
    },
  );

  test("does not coerce a close-date timestamp into a calendar date", () => {
    expect(crmWrite.safeParse({ ...deal, expectedCloseDate: "2026-11-12T12:00:00Z" }).success).toBe(
      false,
    );
    expect(crmWrite.parse({ ...deal, expectedCloseDate: "2026-11-12" })).toMatchObject({
      expectedCloseDate: "2026-11-12",
    });
  });

  test("requires a version and request identity for deal transitions", () => {
    const transition = {
      organizationId,
      action: "transitionDeal",
      entityId,
      stageId,
      outcome: "won",
    };
    expect(crmWrite.safeParse(transition).success).toBe(false);
    expect(crmWrite.safeParse({ ...transition, expectedVersion: 1 }).success).toBe(false);
    expect(crmWrite.safeParse({ ...transition, requestId: entityId }).success).toBe(false);
    expect(
      crmWrite.safeParse({ ...transition, expectedVersion: 0, requestId: entityId }).success,
    ).toBe(false);
    expect(
      crmWrite.parse({ ...transition, expectedVersion: 1, requestId: entityId }),
    ).toMatchObject({ expectedVersion: 1, requestId: entityId, outcome: "won" });
  });

  test("rejects blank customer names", () => {
    expect(
      crmWrite.safeParse({ organizationId, action: "createAccount", name: "  " }).success,
    ).toBe(false);
  });

  test("accepts web account URLs but rejects executable URL schemes", () => {
    const account = { organizationId, action: "createAccount", name: "Northstar" };
    expect(crmWrite.safeParse({ ...account, website: "javascript:alert(1)" }).success).toBe(false);
    expect(crmWrite.safeParse({ ...account, website: "file:///private" }).success).toBe(false);
    expect(crmWrite.parse({ ...account, website: "https://northstar.example" })).toMatchObject({
      website: "https://northstar.example",
    });
  });

  test("bounds list sizes and rejects an empty pipeline configuration", () => {
    expect(crmList.safeParse({ organizationId, limit: 101 }).success).toBe(false);
    expect(crmList.safeParse({ organizationId, limit: 0 }).success).toBe(false);
    expect(
      crmWrite.safeParse({ organizationId, action: "configureStages", stages: [] }).success,
    ).toBe(false);
  });

  test("requires a destination project and audience consent for CRM follow-ups", () => {
    const followUp = {
      organizationId,
      action: "createFollowUp",
      entityId,
      requestId: stageId,
      title: "Send pilot scope",
    };
    expect(crmWrite.safeParse({ ...followUp, consentToTaskAudience: true }).success).toBe(false);
    expect(crmWrite.safeParse({ ...followUp, projectEntityId: entityId }).success).toBe(false);
    expect(
      crmWrite.parse({
        ...followUp,
        projectEntityId: entityId,
        consentToTaskAudience: true,
        dueDate: "2026-11-13",
      }),
    ).toMatchObject({ projectEntityId: entityId, dueDate: "2026-11-13" });
  });

  test("requires an explicit currency choice or clear action when saving defaults", () => {
    const settings = { organizationId, action: "updateSettings" };
    expect(crmWrite.safeParse(settings).success).toBe(false);
    expect(crmWrite.safeParse({ ...settings, defaultCurrency: "US" }).success).toBe(false);
    expect(crmWrite.parse({ ...settings, defaultCurrency: "EUR" })).toMatchObject({
      defaultCurrency: "EUR",
    });
    expect(crmWrite.parse({ ...settings, defaultCurrency: null })).toMatchObject({
      defaultCurrency: null,
    });
  });
});
