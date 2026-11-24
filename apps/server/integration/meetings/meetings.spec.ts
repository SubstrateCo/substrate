import type { ImportCounts, MeetingDetail, MeetingRow } from "@substrate/contracts/meetings";

import { rejected, result } from "../test-support/api";
import { appOrigin } from "../test-support/environment";
import { test, type Actor } from "../test-support/fixtures";
import { expect } from "@playwright/test";

const base = "/api/v1/meetings",
  headers = { origin: appOrigin };
async function scope(actor: Actor) {
  const { user } = await (await actor.request.get("/api/auth/get-session")).json();
  return { organizationId: actor.organizationId, expectedUserId: String(user.id) };
}
const apps = (admin: Actor, enabled: boolean) =>
  admin.request.patch("/api/v1/organizations/apps", {
    headers,
    data: {
      organizationId: admin.organizationId,
      enabledApps: enabled ? ["messages", "agents", "meetings"] : ["messages", "agents"],
    },
  });
test("a large Markdown export, its transcript search and originals are private to one person in one workspace", async ({
  actors,
  workspace,
  request: anonymous,
}) => {
  const [admin, member] = await workspace(actors.owner, actors.member);
  await result(await apps(admin, true));
  const mine = await scope(member),
    other = await scope(admin);
  const raw =
    "\uFEFF# Evening shift\r\n- **Date:** November 18, 2026, 10:45 PM\r\n- **Duration:** 06:17\r\n\r\n<!-- hex:notes -->\r\n## Summary\r\n" +
    "Fictional note. ".repeat(70000) +
    "\r\n<!-- /hex:notes -->\r\n";
  const upload = (params: typeof mine, content: string, origin = appOrigin) =>
    member.request.post(`${base}/import`, { headers: { origin }, params, data: { raw: content } });
  expect((await anonymous.get(`${base}/sources`, { params: mine })).status()).toBe(401);
  expect((await upload(mine, "ignored", "https://untrusted.example.test")).status()).toBe(403);
  expect((await upload(other, "ignored")).status()).toBe(403);
  expect(
    (await upload({ ...mine, organizationId: actors.outsider.organizationId }, "ignored")).status(),
  ).toBe(403);
  expect((await result<ImportCounts>(await upload(mine, raw))).added).toBe(1);
  const list = (actor: Actor, params: typeof mine) =>
    actor.request.post(`${base}/list`, {
      headers,
      data: { ...params, query: { q: "Fictional note" } },
    });
  const {
    rows: [call],
    total,
  } = await result<{ rows: MeetingRow[]; total: number }>(await list(member, mine));
  expect(total).toBe(1);
  expect(call).toMatchObject({ title: "Evening shift", durationMs: 377000, startMs: null });
  const info = `${base}/records/${call.id}`;
  const {
    originals: [original],
  } = await result<MeetingDetail>(await member.request.get(info, { params: mine }));
  const bytes = `${base}/originals/${original.id}`;
  expect(await result(await member.request.get(bytes, { params: mine }))).toBe(raw);
  expect(await result(await list(admin, other))).toEqual({ rows: [], total: 0 });
  for (const path of [info, bytes]) {
    expect(await result(await admin.request.get(path, { params: other }))).toBeNull();
    await rejected(await actors.outsider.request.get(path, { params: mine }), [
      "Evening shift",
      "Fictional note",
    ]);
  }
});
test("manual records require the active account and enabled app; disable and re-enable preserves data", async ({
  actors,
  workspace,
}) => {
  const [owner] = await workspace(actors.owner),
    mine = await scope(owner);
  const data = {
    ...mine,
    meeting: {
      title: "Relay review",
      startsAt: "2026-11-19T03:45:00Z",
      notes: "Private checklist",
    },
    requestId: crypto.randomUUID(),
  };
  const create = () => owner.request.post(`${base}/records`, { headers, data });
  await result(await apps(owner, false));
  expect((await (await create()).json()).error.code).toBe("APP_DISABLED");
  await result(await apps(owner, true));
  expect(
    (
      await owner.request.post(`${base}/records`, {
        headers,
        data: { ...data, expectedUserId: "another-account" },
      })
    ).status(),
  ).toBe(403);
  const { id } = await result<{ id: string }>(await create());
  expect(await result(await create())).toEqual({ id });
  const get = () => owner.request.get(`${base}/records/${id}`, { params: mine });
  await result(await apps(owner, false));
  expect((await (await get()).json()).error.code).toBe("APP_DISABLED");
  await result(await apps(owner, true));
  expect((await result<MeetingDetail>(await get())).originals[0]).toMatchObject({
    provider: "manual",
    notes: "Private checklist",
  });
  for (const path of ["sources", "device/claim", "google-accounts"])
    expect((await owner.request.post(`${base}/${path}`, { headers, data: mine })).status()).toBe(
      404,
    );
});
