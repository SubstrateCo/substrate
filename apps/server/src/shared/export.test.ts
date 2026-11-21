import { exportChunks } from "./export";
import { expect, test } from "bun:test";

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
