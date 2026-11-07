import { ContentNotice } from "../../feedback/content-notice";

export function ConversationUnavailable() {
  return (
    <ContentNotice
      title="Conversation unavailable or access denied."
      description="Check that you are in the right workspace and still have access."
    />
  );
}
