import { ruleTester } from "../test-support.ts";
import { conversationLabel } from "./conversation-label.ts";

const message =
  'A "#" written before a name marks every channel public, including private ones, which show a lock and no "#". Use conversationLabel() for text, or <ConversationKindIcon> beside the bare name, from "@/lib/messaging/conversations" and "@/components/messaging/conversations/conversation-kind-icon". See apps/web/DESIGN.md § 4 Icons.';

ruleTester.run("conversation-label", conversationLabel, {
  valid: [
    "const label = `Message ${conversationLabel(conversation)}`;",
    // A CSS selector, not a conversation name.
    "const selector = `#${CSS.escape(fieldId)}`;",
    "const text = `Order #${number}`;",
  ],
  invalid: [
    { code: "const text = `Message #${conversation.name}`;", errors: [{ message }] },
    { code: "const text = `# ${item.conversationName}`;", errors: [{ message }] },
    { code: "const view = <p>In #{source.name}</p>;", errors: [{ message }] },
  ],
});
