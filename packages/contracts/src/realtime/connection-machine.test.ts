import { realtimeConnectionMachine } from "./connection-machine.ts";
import { expect, test } from "bun:test";

test("only a live connection can become ready or schedule recovery", () => {
  expect(realtimeConnectionMachine.next("disconnected", "ready")).toBeNull();
  expect(realtimeConnectionMachine.next("disconnected", "lost")).toBeNull();
  expect(realtimeConnectionMachine.next("disconnected", "connect")).toBe("connecting");
  expect(realtimeConnectionMachine.next("connecting", "ready")).toBe("connected");
  expect(realtimeConnectionMachine.next("connected", "ready")).toBe("connected");
  expect(realtimeConnectionMachine.next("connected", "lost")).toBe("disconnected");
});

test("a forbidden connection requires an explicit disconnect before reconnecting", () => {
  expect(realtimeConnectionMachine.next("connecting", "forbidden")).toBe("forbidden");
  expect(realtimeConnectionMachine.next("connected", "forbidden")).toBe("forbidden");
  expect(realtimeConnectionMachine.next("forbidden", "connect")).toBeNull();
  expect(realtimeConnectionMachine.next("forbidden", "ready")).toBeNull();
  expect(realtimeConnectionMachine.next("forbidden", "lost")).toBeNull();
  expect(realtimeConnectionMachine.next("forbidden", "disconnect")).toBe("disconnected");
});
