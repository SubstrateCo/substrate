import { useState } from "react";
import { View } from "react-native";

import { MarkdownReferencesContext, MessageMarkdownRenderer } from "./markdown-renderer";
import type { ResolvedReference } from "@/features/messaging/references/resolve-references";
import { useTheme } from "@/theme";
import { useMarkdown } from "react-native-marked";

export function MessageBody({
  body,
  references,
  loading,
  canOpen,
  onOpen,
}: {
  body: string;
  references: Map<string, ResolvedReference>;
  loading: boolean;
  canOpen: (reference: ResolvedReference) => boolean;
  onOpen: (reference: ResolvedReference) => void;
}) {
  const [renderer] = useState(() => new MessageMarkdownRenderer());
  const { colorScheme } = useTheme();
  const elements = useMarkdown(body, { renderer, colorScheme });
  return (
    <MarkdownReferencesContext.Provider value={{ references, loading, canOpen, onOpen }}>
      <View className="min-w-0 gap-2">{elements}</View>
    </MarkdownReferencesContext.Provider>
  );
}
