import { orderActivity } from "./activity-order";
import { describe, expect, test } from "bun:test";

describe("activity chronology", () => {
  test("orders events within the same relative hour by their actual instant, not input or action", () => {
    const items = [
      { id: "c", action: "Task created", createdAt: "2026-11-26T09:00:00.000Z" },
      { id: "a", action: "Discussion unlinked", createdAt: "2026-11-26T10:00:02+01:00" },
      { id: "b", action: "Discussion linked", createdAt: "2026-11-26T09:00:01.999Z" },
    ];
    expect(orderActivity(items).map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(items.map((item) => item.id)).toEqual(["c", "a", "b"]);
  });

  test("breaks equal timestamp ties by descending ID, independently of response order", () => {
    const items = ["a", "c", "b"].map((id) => ({
      id,
      createdAt: "2026-11-26T09:00:00.000Z",
    }));
    expect(orderActivity(items).map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(orderActivity([...items].reverse()).map((item) => item.id)).toEqual(["c", "b", "a"]);
  });

  test("selects the newest five after sorting, not the first five returned", () => {
    const items = Array.from({ length: 7 }, (_, index) => ({
      id: String(index),
      createdAt: `2026-11-26T09:00:0${index}.000Z`,
    }));
    expect(
      orderActivity(items)
        .slice(0, 5)
        .map((item) => item.id),
    ).toEqual(["6", "5", "4", "3", "2"]);
  });
});
