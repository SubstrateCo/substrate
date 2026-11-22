import { exportChunks, exportResponse } from "./export";
import { expect, spyOn, test } from "bun:test";
import { Hono } from "hono";

test("CSV exports escape multiline cells and neutralize spreadsheet formulas", async () => {
  async function* records() {
    yield { name: 'North, "Labs"\r\nTeam', notes: " \t=1+1" };
  }
  const text = await Array.fromAsync(exportChunks(records(), ["name", "notes"], "csv"));
  expect(text.join("")).toBe('"name","notes"\r\n"North, ""Labs""\r\nTeam","\' \t=1+1"\r\n');
});

test("JSON exports preserve structured values and read records only as consumed", async () => {
  let reads = 0;
  async function* records() {
    reads++;
    yield { name: "=Customer", amount: null, tags: ["one", "two"] };
    reads++;
    yield { name: "Second" };
  }
  const chunks = exportChunks(records(), ["name", "amount", "tags"], "json");
  expect((await chunks.next()).value).toBe("[\n");
  expect(reads).toBe(0);
  const first = await chunks.next();
  if (first.done) throw new Error("Expected the first record.");
  expect(reads).toBe(1);
  const remaining = await Array.fromAsync(chunks);
  expect(JSON.parse(`[\n${first.value}${remaining.join("")}`)).toEqual([
    { name: "=Customer", amount: null, tags: ["one", "two"] },
    { name: "Second" },
  ]);
});

test("exportResponse sanitizes mid-stream errors instead of leaking internal error details", async () => {
  const errorLog = spyOn(console, "error").mockImplementation(() => {});
  try {
    async function* failingRecords() {
      yield { name: "First" };
      throw new Error("postgres://secret-driver-detail");
    }
    const app = new Hono().get("/export", (c) =>
      exportResponse(c, { records: failingRecords(), columns: ["name"] }, "json", "test"),
    );
    const response = await app.request("/export");
    expect(response.status).toBe(200);
    let caught: Error | null = null;
    try {
      await response.text();
    } catch (error) {
      if (error instanceof Error) caught = error;
    }
    expect(caught?.message).toBe("Export failed.");
    expect(errorLog).toHaveBeenCalledWith("Export stream failed", "Error");
  } finally {
    errorLog.mockRestore();
  }
});
