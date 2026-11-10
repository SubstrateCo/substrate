import { workspaceSlug } from "./workspace-slug";
import { expect, test } from "bun:test";

test("suggested slugs satisfy the workspace slug pattern", () => {
  const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  for (const name of [
    "Acme Labs, Inc.",
    "  Café Déjà Vu  ",
    "R&D -- Team 2",
    "a".repeat(60) + " b",
  ])
    expect(workspaceSlug(name)).toMatch(pattern);
});

test("suggested slugs keep the words of the name", () => {
  expect(workspaceSlug("Acme Labs, Inc.")).toBe("acme-labs-inc");
  expect(workspaceSlug("Café Déjà Vu")).toBe("cafe-deja-vu");
});

test("a name without letters or numbers suggests no slug", () => {
  expect(workspaceSlug("!!!")).toBe("");
});
