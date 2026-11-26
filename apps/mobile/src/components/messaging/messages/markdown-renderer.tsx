import { createContext, useContext, type ReactNode } from "react";
import { Linking, Platform, ScrollView, View, type TextStyle, type ViewStyle } from "react-native";

import { Text } from "@/components/ui/text";
import { openableLink } from "@/features/messaging/references/markdown-links";
import { bodySegments, referenceKey } from "@/features/messaging/references/reference-tokens";
import type { ResolvedReference } from "@/features/messaging/references/resolve-references";
import { referenceDisplay } from "@/features/messaging/references/token-draft";
import { cn } from "@/lib/utils";
import { Renderer, type RendererInterface } from "react-native-marked";

// On native a long press opens the message actions, which include Copy text.
const selectable = Platform.OS === "web";
const bodyText = "text-[15px] leading-5 text-foreground";

export type MarkdownReferences = {
  references: Map<string, ResolvedReference>;
  loading: boolean;
  canOpen: (reference: ResolvedReference) => boolean;
  onOpen: (reference: ResolvedReference) => void;
};

export const MarkdownReferencesContext = createContext<MarkdownReferences | null>(null);
// Text inside a link stays as written, so a token there is not turned into a chip.
const LiteralContext = createContext(false);

function ReferenceChip({ kind, id }: { kind: string; id: string }) {
  const context = useContext(MarkdownReferencesContext);
  const reference = context?.references.get(referenceKey(kind, id));
  if (!reference)
    return (
      <Text className="rounded bg-muted text-[15px] text-muted-foreground">
        {context?.loading ? " Loading reference " : " Unavailable reference "}
      </Text>
    );
  const pressable = !!context?.canOpen(reference);
  return (
    <Text
      accessibilityRole={pressable ? "link" : undefined}
      onPress={pressable ? () => context?.onOpen(reference) : undefined}
      className={cn(
        "rounded bg-accent text-[15px] font-medium text-accent-foreground",
        pressable && "text-primary",
      )}
    >
      {referenceDisplay(reference)}
    </Text>
  );
}

/** Source text with its reference tokens as chips. The stored text itself is never rewritten. */
function ReferenceRun({ text }: { text: string }) {
  const literal = useContext(LiteralContext);
  if (literal) return text;
  return bodySegments(text).map((segment, index) =>
    segment.type === "text" ? (
      segment.text
    ) : (
      <ReferenceChip key={index} kind={segment.kind} id={segment.id} />
    ),
  );
}

function headingClass(depth: number) {
  if (depth === 1) return "text-xl font-semibold leading-7";
  if (depth === 2) return "text-lg font-semibold leading-6";
  return "text-base font-semibold leading-6";
}

/**
 * Draws Markdown with the app's text primitives and tokens. Links open only web and mail
 * addresses, images show their alt text without loading anything, and HTML shows as written.
 */
export class MessageMarkdownRenderer extends Renderer implements RendererInterface {
  private run(children: string | ReactNode[]) {
    return Array.isArray(children) ? children : <ReferenceRun text={children} />;
  }

  paragraph(children: ReactNode[]) {
    return <View key={this.getKey()}>{children}</View>;
  }

  blockquote(children: ReactNode[]) {
    return (
      <View key={this.getKey()} className="gap-2 border-l-2 border-border pl-3">
        {children}
      </View>
    );
  }

  heading(text: string | ReactNode[], _styles?: TextStyle, depth = 3) {
    return (
      <Text
        key={this.getKey()}
        accessibilityRole="header"
        selectable={selectable}
        className={cn("text-foreground", headingClass(depth))}
      >
        {this.run(text)}
      </Text>
    );
  }

  code(text: string) {
    return (
      <ScrollView
        key={this.getKey()}
        horizontal
        className="rounded-md border border-border bg-muted"
        contentContainerClassName="px-3 py-2"
      >
        <Text selectable={selectable} className="font-mono text-[13px] leading-5 text-foreground">
          {text.replace(/\n$/, "")}
        </Text>
      </ScrollView>
    );
  }

  hr() {
    return <View key={this.getKey()} className="my-1 h-px bg-border" />;
  }

  listItem(children: ReactNode[]) {
    return (
      <View key={this.getKey()} className="min-w-0 flex-1 gap-1">
        {children}
      </View>
    );
  }

  list(
    ordered: boolean,
    li: ReactNode[],
    _listStyle?: ViewStyle,
    _textStyle?: TextStyle,
    start = 1,
  ) {
    return (
      <View key={this.getKey()} className="gap-1">
        {li.map((item, index) => (
          <View key={index} className="flex-row gap-2">
            <Text className={cn(bodyText, "min-w-4 text-muted-foreground")}>
              {ordered ? `${start + index}.` : "•"}
            </Text>
            {item}
          </View>
        ))}
      </View>
    );
  }

  escape(text: string) {
    return <Text key={this.getKey()}>{text}</Text>;
  }

  link(children: string | ReactNode[], href: string) {
    const url = openableLink(href);
    return (
      <LiteralContext.Provider key={this.getKey()} value>
        <Text
          accessibilityRole={url ? "link" : undefined}
          accessibilityHint={url}
          onPress={url ? () => void Linking.openURL(url).catch(() => undefined) : undefined}
          className={cn(url && "text-primary underline")}
        >
          {children}
        </Text>
      </LiteralContext.Provider>
    );
  }

  image(_uri: string, alt?: string) {
    return (
      <Text key={this.getKey()} className={cn(bodyText, "text-muted-foreground")}>
        {`[Image: ${alt || "image"}]`}
      </Text>
    );
  }

  linkImage(href: string, _imageUrl: string, alt?: string) {
    return this.link(`[Image: ${alt || "image"}]`, href);
  }

  strong(children: string | ReactNode[]) {
    return (
      <Text key={this.getKey()} className="font-semibold">
        {this.run(children)}
      </Text>
    );
  }

  em(children: string | ReactNode[]) {
    return (
      <Text key={this.getKey()} className="italic">
        {this.run(children)}
      </Text>
    );
  }

  del(children: string | ReactNode[]) {
    return (
      <Text key={this.getKey()} className="line-through">
        {this.run(children)}
      </Text>
    );
  }

  codespan(text: string) {
    return (
      <Text key={this.getKey()} className="rounded bg-muted font-mono text-[13px] text-foreground">
        {text}
      </Text>
    );
  }

  br() {
    return <Text key={this.getKey()}>{"\n"}</Text>;
  }

  text(text: string | ReactNode[]) {
    if (!Array.isArray(text)) return <ReferenceRun key={this.getKey()} text={text} />;
    return (
      <Text key={this.getKey()} selectable={selectable} className={bodyText}>
        {text}
      </Text>
    );
  }

  html(text: string | ReactNode[]) {
    return (
      <Text key={this.getKey()} selectable={selectable} className={bodyText}>
        {text}
      </Text>
    );
  }

  table(header: ReactNode[][], rows: ReactNode[][][]) {
    const cell = (content: ReactNode[], index: number, head = false) => (
      <View key={index} className={cn("w-40 border-border px-2 py-1.5", index > 0 && "border-l")}>
        <Text className={cn("text-sm leading-5 text-foreground", head && "font-semibold")}>
          {content}
        </Text>
      </View>
    );
    return (
      <ScrollView key={this.getKey()} horizontal className="rounded-md border border-border">
        <View>
          <View className="flex-row bg-muted">
            {header.map((content, index) => cell(content, index, true))}
          </View>
          {rows.map((row, index) => (
            <View key={index} className="flex-row border-t border-border">
              {row.map((content, cellIndex) => cell(content, cellIndex))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }
}
