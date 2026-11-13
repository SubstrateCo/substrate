import { indexVerdict } from "./index-verdict";
import { describe, expect, test } from "bun:test";

const index = { primary: false, unique: false, constraint_name: null, idx_scan: 0 };
const table = { exact_rows: 5_000, seq_scan: 10, idx_scan: 100, heap_size_bytes: 100_000 };

describe("index evidence", () => {
  test("retains unscanned uniqueness constraints", () => {
    expect(indexVerdict({ ...index, unique: true }, table, 0)).toBe("keep (constraint)");
  });
  test("distinguishes coverage use from measured traffic", () => {
    expect(indexVerdict(index, table, 4)).toBe("coverage only");
    expect(indexVerdict({ ...index, idx_scan: 2 }, table, 4)).toBe("used");
  });
  test("does not nominate empty, small, unread, or uncovered tables", () => {
    expect(indexVerdict(index, { ...table, exact_rows: 0 }, 0)).toBe("not exercised (empty table)");
    expect(indexVerdict(index, { ...table, exact_rows: 500 }, 0)).toBe("not judged (small table)");
    expect(indexVerdict(index, { ...table, heap_size_bytes: 8192 }, 0)).toBe(
      "not judged (small table)",
    );
    expect(indexVerdict(index, { ...table, seq_scan: 0, idx_scan: 0 }, 0)).toBe(
      "not exercised (no reads)",
    );
    expect(indexVerdict(index, table, undefined)).toBe("not judged (coverage missing)");
  });
  test("only nominates a populated, read table with coverage evidence", () => {
    expect(indexVerdict(index, table, 0)).toBe("review candidate");
    expect(indexVerdict(index, table, 0, 1)).toBe("plan-only");
  });
});
