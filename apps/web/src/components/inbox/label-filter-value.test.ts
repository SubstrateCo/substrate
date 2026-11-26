import type { Mailbox, MailLabel } from "@substrate/contracts/mail";

import { labelChoices, labelOptionValue, parseLabelOptionValue } from "./label-filter-value";
import { describe, expect, test } from "bun:test";

const label = (id: string, filterMode?: MailLabel["filterMode"]): MailLabel => ({
  id,
  name: id,
  filterMode,
});
const box = (id: string, labels: MailLabel[]): Mailbox => ({
  id,
  address: `${id}@example.com`,
  nickname: null,
  canModify: true,
  labels,
  showLabelFilters: true,
  unreadLabelIds: [],
  lastSync: null,
  status: "idle",
});

describe("label option values", () => {
  test("IDs that contain separators or quotes round-trip unchanged", () => {
    const filter = { mailboxId: 'work:"a"', id: "Label_1/2,3" };
    expect(parseLabelOptionValue(labelOptionValue(filter))).toEqual(filter);
  });

  test("values this app did not write name no label", () => {
    for (const value of [undefined, "", "Label_1", "[]", '["work"]', '["work",""]', "[1,2]"])
      expect(parseLabelOptionValue(value)).toBeUndefined();
  });
});

describe("label choices", () => {
  const work = box("work", [label("review"), label("hidden", "hide")]);
  const home = box("home", [label("trips")]);

  test("a chosen mailbox offers only its own visible labels", () => {
    const ids = labelChoices([work, home], work, undefined).map((c) => [c.box.id, c.label.id]);
    expect(ids).toEqual([["work", "review"]]);
  });

  test("all inboxes offer every mailbox's visible labels", () => {
    const ids = labelChoices([work, home], null, undefined).map((c) => [c.box.id, c.label.id]);
    expect(ids).toEqual([
      ["work", "review"],
      ["home", "trips"],
    ]);
  });

  test("the active label stays listed in its mailbox after it is hidden", () => {
    const ids = labelChoices([work, home], null, { mailboxId: "work", id: "hidden" }).map((c) => [
      c.box.id,
      c.label.id,
    ]);
    expect(ids).toEqual([
      ["work", "hidden"],
      ["work", "review"],
      ["home", "trips"],
    ]);
  });
});
