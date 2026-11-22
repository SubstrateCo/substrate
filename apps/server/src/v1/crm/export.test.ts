import { AccessDeniedError, AppDisabledError } from "@substrate/database";

import { exportChunks } from "../../shared/export";
import { createTestScopes, scopeFixture } from "../../test-support";
import { exportCrm } from "./export";
import { createCrmExportRoutes } from "./export-routes";
import { createCrmService } from "./service";
import { expect, mock, test } from "bun:test";

const service = createCrmService({ publish: async (committed) => committed.result });

test("JSON exports use the same safe fields without changing formula-like names", async () => {
  const { scope, listAccounts } = fixture();
  listAccounts.mockResolvedValue([account("customer", "=North")]);
  const app = createCrmExportRoutes(
    service,
    createTestScopes({ repositories: { forSession: async () => scope.repositories } }),
  );
  const response = await app.request("/export?organizationId=org&kind=accounts&format=json");
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(response.headers.get("content-disposition")).toBe(
    'attachment; filename="crm-accounts.json"',
  );
  expect(await response.json()).toEqual([
    { entityId: "customer", name: "=North", website: null, domain: null, archivedAt: null },
  ]);
});

function account(entityId: string, name = "Customer") {
  return {
    entityId,
    organizationId: "org",
    entityType: "account" as const,
    name,
    website: null,
    domain: null,
    summary: "PRIVATE SOURCE BODY",
    ownerActorEntityId: crypto.randomUUID(),
    archivedAt: null,
  };
}

function fixture(role = "owner") {
  const scope = scopeFixture();
  const listAccounts = mock(
    async (_options: { limit?: number; afterEntityId?: string; search?: string }) => [
      account(crypto.randomUUID()),
    ],
  );
  scope.repositories = {
    ...scope.repositories,
    organizations: {
      ...scope.repositories.organizations,
      summary: async () => ({ id: "org", name: "Workspace", logo: null, role }),
    },
    crm: { ...scope.repositories.crm, listAccounts },
  };
  return { scope, listAccounts };
}

// Parse the result independently, including doubled quotes and embedded CR/LF.
function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\r")) {
      row.push(cell);
      cell = "";
      if (char === "\r") {
        rows.push(row);
        row = [];
        i++;
      }
    } else cell += char;
  }
  return rows;
}

test("CSV round-trips quotes and newlines and neutralizes formulas after controls/whitespace", async () => {
  const { scope, listAccounts } = fixture();
  const names = ['Acme, "North"\r\nLabs', " \t\u0000=1+1", "\n+SUM(A1)", "\u2003-1", "\r@SUM(A1)"];
  listAccounts.mockResolvedValue(names.map((name) => account(crypto.randomUUID(), name)));
  const result = await exportCrm(scope, {
    organizationId: "org",
    kind: "accounts",
    archived: "active",
  });
  expect(result.success).toBe(true);
  if (!result.success) return;
  const text = (
    await Array.fromAsync(exportChunks(result.data.records, result.data.columns, "csv"))
  ).join("");
  const rows = parseCsv(text);
  expect(rows[0]).toEqual(["entityId", "name", "website", "domain", "archivedAt"]);
  expect(rows.slice(1).map((row) => row[1])).toEqual([
    names[0],
    ...names.slice(1).map((name) => `'${name}`),
  ]);
  expect(text).not.toContain("PRIVATE SOURCE BODY");
});

test("read-only members cannot export even readable records", async () => {
  const { scope, listAccounts } = fixture("member");
  expect(
    await exportCrm(scope, { organizationId: "org", kind: "accounts", archived: "active" }),
  ).toMatchObject({
    success: false,
    error: { code: "FORBIDDEN" },
  });
  expect(listAccounts).not.toHaveBeenCalled();
});

test("search exports matching rows across pages and rejects searches above 200 characters", async () => {
  const { scope, listAccounts } = fixture();
  const matching = Array.from({ length: 101 }, (_, i) =>
    account(String(i).padStart(6, "0"), `North customer ${i}`),
  );
  const hidden = account("999999", "South customer");
  listAccounts.mockImplementation(async ({ limit = 100, afterEntityId, search }) =>
    [...matching, hidden]
      .filter(
        (row) =>
          (!afterEntityId || row.entityId > afterEntityId) &&
          (!search || row.name.includes(search)),
      )
      .slice(0, limit),
  );
  const app = createCrmExportRoutes(
    service,
    createTestScopes({ repositories: { forSession: async () => scope.repositories } }),
  );
  const response = await app.request("/export?organizationId=org&kind=accounts&search=%20North%20");
  expect(response.status).toBe(200);
  const rows = parseCsv(await response.text()).slice(1);
  expect(rows.map((row) => row[0])).toEqual(matching.map((row) => row.entityId));
  expect(rows.map((row) => row[1])).not.toContain(hidden.name);
  listAccounts.mockClear();
  const invalid = await app.request(
    `/export?organizationId=org&kind=accounts&search=${"x".repeat(201)}`,
  );
  expect(invalid.status).toBe(400);
  expect(listAccounts).not.toHaveBeenCalled();
});

test("streams every page beyond the former 1,000-record limit", async () => {
  const { scope, listAccounts } = fixture("admin");
  const records = Array.from({ length: 1101 }, (_, i) => account(String(i).padStart(6, "0")));
  listAccounts.mockImplementation(async ({ limit = 100, afterEntityId }) =>
    records.filter((row) => !afterEntityId || row.entityId > afterEntityId).slice(0, limit),
  );
  const input = { organizationId: "org", kind: "accounts" as const, archived: "all" as const };
  const result = await exportCrm(scope, input);
  expect(result.success).toBe(true);
  // First page is fetched eagerly so access/app errors fail before streaming starts; remaining pages stay lazy.
  expect(listAccounts).toHaveBeenCalledTimes(1);
  if (result.success) {
    const text = (
      await Array.fromAsync(exportChunks(result.data.records, result.data.columns, "csv"))
    ).join("");
    expect(
      parseCsv(text)
        .slice(1)
        .map((row) => row[0]),
    ).toEqual(records.map((row) => row.entityId));
  }
});

test("first-page app and access errors fail inside serviceResult before HTTP 200 streaming starts", async () => {
  for (const [error, status, code] of [
    [new AppDisabledError(), 403, "APP_DISABLED"],
    [new AccessDeniedError(), 404, "NOT_FOUND"],
  ] as const) {
    const { scope, listAccounts } = fixture();
    listAccounts.mockRejectedValue(error);
    const app = createCrmExportRoutes(
      service,
      createTestScopes({ repositories: { forSession: async () => scope.repositories } }),
    );
    const response = await app.request("/export?organizationId=org&kind=accounts");
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ success: false, error: { code } });
  }
});

test("attachment responses are private and foreign workspace requests are rejected before reads", async () => {
  const { scope, listAccounts } = fixture();
  const app = createCrmExportRoutes(
    service,
    createTestScopes({ repositories: { forSession: async () => scope.repositories } }),
  );
  const response = await app.request("/export?organizationId=org&kind=accounts");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  expect(response.headers.get("content-disposition")).toBe(
    'attachment; filename="crm-accounts.csv"',
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
  listAccounts.mockClear();
  const foreign = await app.request("/export?organizationId=foreign&kind=accounts");
  expect(foreign.status).toBe(403);
  expect(listAccounts).not.toHaveBeenCalled();
  expect(await foreign.text()).not.toContain("Customer");
});

test("export requires a verified session and validates kind before reading records", async () => {
  const { scope, listAccounts } = fixture();
  for (const session of [
    null,
    { ...scope.session, user: { ...scope.session.user, emailVerified: false } },
  ]) {
    const app = createCrmExportRoutes(
      service,
      createTestScopes({
        api: {
          getSession: async () => session,
          getActiveMemberRole: async () => ({ role: "owner" }),
        },
      }),
    );
    expect((await app.request("/export?organizationId=org&kind=accounts")).status).toBe(
      session ? 403 : 401,
    );
  }
  const app = createCrmExportRoutes(service, createTestScopes());
  expect((await app.request("/export?organizationId=org&kind=interactions")).status).toBe(400);
  expect(listAccounts).not.toHaveBeenCalled();
});
