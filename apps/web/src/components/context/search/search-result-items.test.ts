import { searchResultItems } from "./search-result-items";
import {
  contactLink,
  crmLink,
  interactionLink,
  interactionPersonLink,
  messageLink,
  workLink,
} from "@/lib/navigation/record-links";
import { expect, test } from "bun:test";

const hits = [
  { id: "task", kind: "task", projectEntityId: "project" },
  { id: "project", kind: "project", projectEntityId: "project" },
  { id: "acme", kind: "account" },
  { id: "renewal", kind: "deal" },
  { id: "maya", kind: "contact" },
  { id: "reply", kind: "message", conversationId: "launch" },
];

test("results hide records whose app is off", () => {
  const kinds = (apps: { tasks: boolean; crm: boolean }) =>
    searchResultItems(hits, "team", apps).map((item) => item.id);
  expect(kinds({ tasks: false, crm: false })).toEqual(["maya", "reply"]);
  expect(kinds({ tasks: true, crm: false })).toEqual(["task", "project", "maya", "reply"]);
  expect(kinds({ tasks: false, crm: true })).toEqual(["acme", "renewal", "maya", "reply"]);
});

test("each result links to the app that owns it", () => {
  const links = searchResultItems(hits, "team", { tasks: true, crm: true }).map((i) => i.link);
  expect(links).toEqual([
    workLink("team", "project", "task"),
    workLink("team", "project"),
    crmLink("team", "accounts", "acme"),
    crmLink("team", "deals", "renewal"),
    contactLink("team", "maya"),
    messageLink("team", "launch", "reply"),
  ]);
});

test("a person and their interactions open in Interactions when CRM is off", () => {
  const people = [
    { id: "maya", kind: "contact" },
    { id: "call", kind: "contact_interaction", contactEntityId: "maya" },
    { id: "note", kind: "contact_interaction" },
  ];
  expect(
    searchResultItems(people, "team", { tasks: false, crm: false }).map((i) => i.link),
  ).toEqual([
    interactionPersonLink("team", "maya"),
    interactionPersonLink("team", "maya"),
    interactionLink("team", "note"),
  ]);
});
