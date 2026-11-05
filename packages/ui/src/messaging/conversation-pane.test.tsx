import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationPane } from "./conversation-pane";

test("an access error hides messages, composer, and threads supplied by the app", () => {
  const markup = renderToStaticMarkup(
    <ConversationPane
      conversation={{ id: "private", kind: "channel", name: "Private", private: true }}
      error={new Error("Conversation not found or access denied.")}
      onRetry={() => {}}
      onToggleMembers={() => {}}
      messages={<p>Cached private message</p>}
      composer={<p>Send private message</p>}
      thread={<p>Cached private reply</p>}
    />,
  );
  expect(markup).toContain("Conversation not found or access denied.");
  expect(markup).toContain("Retry</button>");
  expect(markup).not.toContain("Cached private");
  expect(markup).not.toContain("Send private message");
});
