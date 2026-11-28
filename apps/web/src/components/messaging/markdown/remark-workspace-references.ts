import { referenceTokenPattern } from "@/lib/messaging/reference-token";

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hName?: string; hProperties?: Record<string, string> };
};

export function remarkWorkspaceReferences() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (
        ["code", "inlineCode", "link", "linkReference", "image", "imageReference"].includes(
          node.type,
        )
      )
        return;
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value) {
          visit(child);
          return [child];
        }
        const nodes: MarkdownNode[] = [];
        let start = 0;
        for (const match of child.value.matchAll(referenceTokenPattern)) {
          if (match.index > start)
            nodes.push({ type: "text", value: child.value.slice(start, match.index) });
          nodes.push({
            type: "workspaceReference",
            data: {
              hName: "span",
              hProperties: {
                "data-reference-kind": match[1]!.toLowerCase(),
                "data-reference-id": match[2]!,
              },
            },
            children: [],
          });
          start = match.index + match[0].length;
        }
        if (start === 0) return [child];
        if (start < child.value.length)
          nodes.push({ type: "text", value: child.value.slice(start) });
        return nodes;
      });
      for (let i = 1; i < node.children.length; i++) {
        const previous = node.children[i - 1];
        const current = node.children[i];
        if (previous.type === "workspaceReference" && current.type === "text" && current.value)
          current.value = current.value.replace(/^[ \t]+(?=[,.;:!?])/, "");
      }
    };
    visit(tree);
  };
}
