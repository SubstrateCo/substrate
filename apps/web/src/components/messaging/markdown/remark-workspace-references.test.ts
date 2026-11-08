import { remarkWorkspaceReferences } from "./remark-workspace-references";
import { describe, expect, test } from "bun:test";

const id = "00000000-0000-4000-8000-000000000001";

describe("workspace references in message Markdown", () => {
  test("keeps reference identity separate from surrounding message text", () => {
    const tree: Parameters<ReturnType<typeof remarkWorkspaceReferences>>[0] = {
      type: "paragraph",
      children: [{ type: "text", value: `Review @[task:${id}] today` }],
    };

    remarkWorkspaceReferences()(tree);

    expect(tree.children).toEqual([
      { type: "text", value: "Review " },
      {
        type: "workspaceReference",
        data: {
          hName: "span",
          hProperties: { "data-reference-kind": "task", "data-reference-id": id },
        },
        children: [],
      },
      { type: "text", value: " today" },
    ]);
  });

  test.each(["code", "inlineCode", "link", "linkReference", "image", "imageReference"])(
    "keeps reference syntax literal inside %s",
    (type) => {
      const child = { type: "text", value: `@[task:${id}]` };
      const tree = { type: "root", children: [{ type, children: [child] }] };

      remarkWorkspaceReferences()(tree);

      expect(tree.children[0]!.children).toEqual([child]);
    },
  );

  test("leaves unsupported kinds and malformed reference IDs as text", () => {
    const value = `@[document:${id}] @[person:alex]`;
    const tree = { type: "paragraph", children: [{ type: "text", value }] };

    remarkWorkspaceReferences()(tree);

    expect(tree.children).toEqual([{ type: "text", value }]);
  });

  test.each(["channel", "thread"])(
    "renders a structured %s reference, not plain hashtags",
    (kind) => {
      const tree: Parameters<ReturnType<typeof remarkWorkspaceReferences>>[0] = {
        type: "paragraph",
        children: [{ type: "text", value: `#general @[${kind}:${id}]` }],
      };
      remarkWorkspaceReferences()(tree);
      expect(tree.children?.[0]).toEqual({ type: "text", value: "#general " });
      expect(tree.children?.[1]?.data?.hProperties).toEqual({
        "data-reference-kind": kind,
        "data-reference-id": id,
      });
    },
  );
});
