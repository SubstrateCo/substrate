import { createMemoryHistory } from "@tanstack/react-router";

import { panelReturnDelta, trackPanelHistory } from "./panel-history";
import { expect, test } from "bun:test";

const list = "/contacts?workspaceId=team";

function historyAt(href = list) {
  const history = createMemoryHistory({ initialEntries: [href] });
  trackPanelHistory(history);
  return history;
}

async function push(history: ReturnType<typeof historyAt>, href: string) {
  history.push(href);
  await Promise.resolve();
}

test("dismissal returns across sibling records but keeps nested parents", async () => {
  const history = historyAt();
  await push(history, `${list}&recordId=first`);
  await push(history, `${list}&recordId=second`);
  expect(panelReturnDelta(history, list, ["recordId"])).toBe(-2);
  const contact = history.location.href;
  await push(history, `${contact}&interactionId=call`);
  expect(panelReturnDelta(history, contact, ["interactionId"])).toBe(-1);
});

test("direct entry and reload cannot infer an opener from browser history length", () => {
  const history = createMemoryHistory({
    initialEntries: [list, `${list}&recordId=first`],
    initialIndex: 1,
  });
  trackPanelHistory(history);
  expect(panelReturnDelta(history, list, ["recordId"])).toBeUndefined();
});

test("dismissal does not cross another destination or changed background context", async () => {
  const history = historyAt();
  await push(history, "/messages?workspaceId=team");
  await push(history, `${list}&recordId=first`);
  expect(panelReturnDelta(history, list, ["recordId"])).toBeUndefined();
  history.replace(`${list}&recordId=first&contactId=other`);
  await Promise.resolve();
  expect(panelReturnDelta(history, list, ["recordId"])).toBeUndefined();
});

test("replacing an entry and branching after Back invalidate stale return candidates", async () => {
  const history = historyAt();
  await push(history, `${list}&recordId=first`);
  await push(history, `${list}&recordId=second`);
  history.back();
  await Promise.resolve();
  history.replace(`${list}&archived=true`);
  await Promise.resolve();
  await push(history, `${list}&recordId=third`);
  expect(panelReturnDelta(history, list, ["recordId"])).toBeUndefined();
});

test("workspace changes invalidate previous return entries", async () => {
  const history = historyAt();
  await push(history, "/contacts?workspaceId=other&recordId=private");
  await push(history, `${list}&recordId=first`);
  expect(panelReturnDelta(history, list, ["recordId"])).toBeUndefined();
});

test("return matching ignores query order but preserves hashes and background parameters", async () => {
  const history = historyAt("/calendar?view=month&workspaceId=team#week");
  await push(history, "/calendar?workspaceId=team&eventId=meeting&view=month#week");
  expect(panelReturnDelta(history, "/calendar?workspaceId=team&view=month#week", ["eventId"])).toBe(
    -1,
  );
  expect(
    panelReturnDelta(history, "/calendar?workspaceId=team&view=month", ["eventId"]),
  ).toBeUndefined();
});

test("a sheet's Back control returns to a known settings page rather than pushing it again", async () => {
  const overview = "/agents?workspaceId=team&agentId=helper&settings=overview";
  const history = historyAt("/agents?workspaceId=team&agentId=helper");
  await push(history, overview);
  await push(history, "/agents?workspaceId=team&agentId=helper&settings=routines");
  expect(panelReturnDelta(history, overview, ["settings"])).toBe(-1);
  expect(panelReturnDelta(history, "/agents?workspaceId=team&agentId=helper", ["settings"])).toBe(
    -2,
  );
});

test("superseded same-event navigations cannot prove a continuous return path", async () => {
  const history = historyAt();
  history.push(`${list}&recordId=first`);
  history.push(`${list}&recordId=second`);
  await Promise.resolve();
  expect(panelReturnDelta(history, list, ["recordId"])).toBeUndefined();
});
