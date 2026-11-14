import { hasUnsafePathCharacter } from "./paths.ts";
import { expect, test } from "bun:test";

test("rejects backslashes, spaces, and ASCII controls but keeps other characters", () => {
  for (const path of ["/a\\b", "/a b", "/\u0000", "/\u001f", "/a\nb", "/\u007f"]) {
    expect(hasUnsafePathCharacter(path)).toBe(true);
  }
  for (const path of ["/dashboard?x=1#y", "/!~", "/\u0080", "/ ", "/café", "/😀"]) {
    expect(hasUnsafePathCharacter(path)).toBe(false);
  }
});
