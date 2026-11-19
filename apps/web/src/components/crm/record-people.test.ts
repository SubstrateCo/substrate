import { recordPeople } from "./record-people-directory";
import { expect, test } from "bun:test";

test("record choices join current workspace humans by user identity, not email or actor identity", () => {
  const members = [
    { id: "user-one", name: "One", email: "same@example.com" },
    { id: "user-two", name: "Two", email: "same@example.com" },
  ];
  expect(
    recordPeople(
      [
        { entityId: "actor-one", userId: "user-one", type: "human" },
        { entityId: "actor-two", userId: "user-two", type: "human" },
        { entityId: "agent", userId: "user-one", type: "agent" },
        { entityId: "former", userId: "departed", type: "human" },
        { entityId: "user-one", userId: null, type: "human" },
      ],
      members,
    ),
  ).toEqual([
    { id: "actor-one", name: "One", email: "same@example.com" },
    { id: "actor-two", name: "Two", email: "same@example.com" },
  ]);
});
